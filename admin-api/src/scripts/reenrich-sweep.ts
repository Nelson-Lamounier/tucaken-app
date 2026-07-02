/**
 * @format
 * Periodic re-enrichment sweep — drains the deferred enrichment backlog.
 *
 * Chunks left `enrichment_status IN ('pending','skipped_quota')` by a deferred
 * or deadline-stopped ingestion pass only get enriched when their repo next
 * syncs. With push webhooks quiet, that backlog can sit for weeks (live
 * finding: 801 chunks pending). This sweep, designed to run as a K8s CronJob
 * (one Pod / day) on the existing admin-api image, finds users with a backlog
 * and dispatches one run-reenrich Job (ingestion image) per eligible user.
 *
 * TIER GATE — LLM enrichment is a PAID entitlement. A full-repo enrichment
 * bills real Bedrock money (order of 10 EUR for a large repo), so:
 *   1. Only users whose entitlements resolve to enrichment === 'full'
 *      (premium plan, or persisted admin role) are dispatched. Free/pro/trial
 *      backlogs are logged and skipped — they drain deterministically (Tier-1)
 *      on their next ordinary sync, never via Bedrock.
 *   2. Belt-and-braces: the Job env still carries the per-user enrichment
 *      env from resolveEnrichmentEnv, and run-reenrich exits early on
 *      ENRICHMENT_DISABLED=1 — a mis-dispatch cannot bill.
 *
 * Idempotency: run-reenrich only selects rows still pending/skipped, so an
 * overlapping or repeated sweep re-processes nothing that already completed.
 * MAX_SWEEP_JOBS (default 10) bounds dispatch per run to avoid a stampede.
 *
 * Trigger locally for verification:
 *   yarn dlx tsx admin-api/src/scripts/reenrich-sweep.ts --dry-run
 */

import { Pool } from 'pg';

import { loadConfig, getJobImage, isImageConfigured } from '../lib/config.js';
import { getBatchApi } from '../lib/k8s.js';
import { buildReenrichJobSpec } from '../lib/ingestion-job.js';
import { entitlementsFromConfig } from '../lib/entitlements.js';
import { getCachedTierConfig } from '../lib/tier-config-cache.js';
import { getUserPlanStatus } from '../lib/repositories/users.js';

const DRY_RUN        = process.argv.includes('--dry-run');
const MAX_SWEEP_JOBS = Number(process.env['MAX_SWEEP_JOBS'] ?? '10');
/** Minimum backlog size worth a Job — a handful of chunks waits for the next sync. */
const MIN_PENDING    = Number(process.env['MIN_PENDING_CHUNKS'] ?? '25');

interface BacklogRow {
  user_id: string;
  pending: string;
}

interface SweepResult {
  usersWithBacklog: number;
  dispatched: string[];
  skipped: Array<{ userId: string; pending: number; reason: string }>;
}

/** Users with a deferred-enrichment backlog, largest first. */
async function findBacklogUsers(pool: Pool): Promise<BacklogRow[]> {
  const { rows } = await pool.query<BacklogRow>(
    `SELECT user_id, COUNT(*) AS pending
       FROM document_embeddings
      WHERE metadata->>'enrichment_status' IN ('pending', 'skipped_quota')
      GROUP BY user_id
     HAVING COUNT(*) >= $1
      ORDER BY COUNT(*) DESC`,
    [MIN_PENDING],
  );
  return rows;
}

async function main(): Promise<SweepResult> {
  const pool = new Pool({
    host:     process.env['PG_HOST'],
    port:     Number(process.env['PG_PORT'] ?? 5432),
    database: process.env['PG_DATABASE'],
    user:     process.env['PG_USER'],
    password: process.env['PG_PASSWORD'],
    ssl:      { rejectUnauthorized: false },
    max:      1,
  });

  const cfg   = loadConfig();
  const image = getJobImage('ingestion');
  if (!isImageConfigured(image)) throw new Error('ingestion image URI is not configured');

  const backlog = await findBacklogUsers(pool);
  const tierConfig = await getCachedTierConfig(pool).catch(() => null);
  const result: SweepResult = { usersWithBacklog: backlog.length, dispatched: [], skipped: [] };

  for (const row of backlog) {
    const pending = Number(row.pending);
    if (result.dispatched.length >= MAX_SWEEP_JOBS) {
      result.skipped.push({ userId: row.user_id, pending, reason: 'sweep job cap reached' });
      continue;
    }
    const plan = await getUserPlanStatus(pool, row.user_id);
    if (!plan) {
      result.skipped.push({ userId: row.user_id, pending, reason: 'user not found' });
      continue;
    }
    // Premium-only: LLM enrichment costs real Bedrock money. Free/pro/trial
    // backlogs drain deterministically (Tier-1) on their next ordinary sync.
    const enrichment = tierConfig
      ? entitlementsFromConfig(tierConfig, plan.effectivePlan, plan.role).enrichment
      : 'tier1';
    if (enrichment !== 'full') {
      result.skipped.push({ userId: row.user_id, pending, reason: `plan '${plan.effectivePlan}' has no LLM enrichment entitlement` });
      continue;
    }
    if (DRY_RUN) {
      // eslint-disable-next-line no-console
      console.log('[dry-run] would dispatch reenrich', { userId: row.user_id, pending });
      result.dispatched.push(row.user_id);
      continue;
    }
    const spec = buildReenrichJobSpec(cfg, image, row.user_id, Date.now(), {
      effectivePlan: plan.effectivePlan,
      role:          plan.role,
      tierConfig,
    });
    await getBatchApi().createNamespacedJob({ namespace: cfg.ingestionNamespace, body: spec });
    result.dispatched.push(row.user_id);
    // eslint-disable-next-line no-console
    console.log('dispatched reenrich job', { userId: row.user_id, pending, job: spec.metadata?.name });
  }

  await pool.end();
  return result;
}

main()
  .then((res) => {
    // eslint-disable-next-line no-console
    console.log('reenrich sweep summary', res);
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('reenrich sweep failed', err);
    process.exit(1);
  });
