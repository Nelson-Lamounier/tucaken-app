/**
 * @format
 * GitHub App installation reconciliation sweep — backstop for orphaned installs.
 *
 * The App lives on GitHub's servers; RDS only stores the installation_id. Any
 * RDS deletion (account hard-delete cascade, a stray manual DELETE, or a failed
 * best-effort revoke) can leave an installation live on GitHub with no active
 * owner in our DB. This sweep compares GitHub's installation list against RDS
 * and uninstalls the orphans.
 *
 * Designed to run as a K8s CronJob using the admin-api image, same pattern as
 * account-sweep.ts. Reuses the App credentials already injected into the API.
 *
 * SAFETY — destructive action is OPT-IN:
 *   • Dry-run by default. Pass --apply (or RECONCILE_APPLY=true) to uninstall.
 *   • Grace window: installs younger than RECONCILE_GRACE_HOURS (default 1h)
 *     are skipped — the connect flow creates the install on GitHub before the
 *     oauth_connections row is written, so a fresh install is not yet "known".
 *   • Sanity abort: if RDS reports zero known installs but GitHub lists several,
 *     refuse to act (likely a DB/query fault — don't mass-uninstall).
 *
 * Direction: GitHub → RDS (forward) uninstalls orphans. The reverse (DB rows
 * whose install is already gone on GitHub) is the installation.deleted
 * webhook's job; here it is only logged as `stale_db_connection`.
 *
 * Trigger locally:
 *   npx tsx admin-api/src/scripts/reconcile-github-installations.ts          # dry-run
 *   npx tsx admin-api/src/scripts/reconcile-github-installations.ts --apply  # act
 */

import { Pushgateway, Registry, Counter, Gauge } from 'prom-client';
import { Pool } from 'pg';

import { listAppInstallations, deleteInstallation } from '../lib/github-app.js';

const APPLY       = process.argv.includes('--apply') || process.env['RECONCILE_APPLY'] === 'true';
const GRACE_HOURS = Number(process.env['RECONCILE_GRACE_HOURS'] ?? '1');
// If RDS shows no active installs but GitHub lists more than this, abort rather
// than risk uninstalling everything because of a transient DB/query failure.
const SANITY_MAX_GHOST = Number(process.env['RECONCILE_SANITY_MAX_GHOST'] ?? '5');

// ── Metrics ───────────────────────────────────────────────────────────────────
// One-shot Job → no /metrics scrape; push to the Pushgateway at the end. push()
// (not pushAdd) so each run REPLACES the group — the series reflect the latest
// run, not an ever-growing sum. concurrencyPolicy=Forbid guarantees one writer.
const registry = new Registry();
registry.setDefaultLabels({
  service: process.env['OTEL_SERVICE_NAME'] ?? 'reconcile-github-installations',
  env:     process.env['DEPLOY_ENV']         ?? 'dev',
});

const reconcileTotal = new Counter({
  name:       'github_installation_reconcile_total',
  help:       'GitHub App installation reconciliation outcomes in the last run.',
  labelNames: ['outcome'] as const,
  registers:  [registry],
});

const scannedGauge = new Gauge({
  name:       'github_installation_reconcile_scanned',
  help:       'Installations scanned in the last reconcile run, by side.',
  labelNames: ['side'] as const,
  registers:  [registry],
});

// Seed every outcome at 0 so the first real value reads as a clean jump.
const OUTCOMES = [
  'orphan_revoked', 'orphan_failed', 'skipped_recent',
  'stale_db', 'dry_run_orphan', 'aborted_sanity',
] as const;
for (const outcome of OUTCOMES) reconcileTotal.inc({ outcome }, 0);

async function pushMetrics(): Promise<void> {
  const url = process.env['PUSHGATEWAY_URL'];
  if (!url) return;
  try {
    const gateway = new Pushgateway(url, {}, registry);
    await gateway.push({ jobName: 'reconcile-github-installations' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('pushgateway push failed', err instanceof Error ? err.message : String(err));
  }
}

interface ReconcileResult {
  apply:         boolean;
  totalGithub:   number;
  knownActive:   number;
  revoked:       string[];
  failed:        Array<{ id: string; reason: string }>;
  skippedRecent: string[];
  orphansDryRun: string[];
  staleDb:       string[];
}

async function main(): Promise<ReconcileResult> {
  const appId = process.env['GITHUB_APP_ID'];
  const key   = process.env['GITHUB_PRIVATE_KEY'];
  if (!appId || !key) {
    throw new Error('GITHUB_APP_ID / GITHUB_PRIVATE_KEY not set — cannot reconcile.');
  }

  const pool = new Pool({
    host:     process.env['PG_HOST'],
    port:     Number(process.env['PG_PORT'] ?? 5432),
    database: process.env['PG_DATABASE'],
    user:     process.env['PG_USER'],
    password: process.env['PG_PASSWORD'],
    max:      1,
  });

  try {
    const installations = await listAppInstallations(appId, key);

    // Known = installation_ids owned by an ACTIVE (not soft-deleted) user.
    // Soft-deleted users are intentionally excluded so their installs (whose
    // revoke at deletion time may have failed) get cleaned up here too.
    const { rows } = await pool.query<{ installation_id: string }>(
      `SELECT o.installation_id
         FROM oauth_connections o
         JOIN users u ON u.id = o.user_id
        WHERE o.provider = 'github'
          AND o.installation_id IS NOT NULL
          AND u.deleted_at IS NULL`,
    );
    const known = new Set(rows.map((r) => String(r.installation_id)));

    scannedGauge.set({ side: 'github' }, installations.length);
    scannedGauge.set({ side: 'known' },  known.size);

    const result: ReconcileResult = {
      apply:         APPLY,
      totalGithub:   installations.length,
      knownActive:   known.size,
      revoked:       [],
      failed:        [],
      skippedRecent: [],
      orphansDryRun: [],
      staleDb:       [],
    };

    // Sanity guard before any destructive action.
    if (known.size === 0 && installations.length > SANITY_MAX_GHOST) {
      // eslint-disable-next-line no-console
      console.error(
        '[reconcile] ABORT — 0 known active installs but GitHub lists',
        installations.length,
        '(possible DB fault); refusing to mass-uninstall',
      );
      reconcileTotal.inc({ outcome: 'aborted_sanity' });
      await pushMetrics();
      await pool.end();
      process.exit(2);
    }

    const graceMs = GRACE_HOURS * 3_600_000;
    const now     = Date.now();

    for (const inst of installations) {
      const id = String(inst.id);
      if (known.has(id)) continue;

      const ageMs = now - Date.parse(inst.createdAt);
      if (Number.isFinite(ageMs) && ageMs < graceMs) {
        result.skippedRecent.push(id);
        reconcileTotal.inc({ outcome: 'skipped_recent' });
        continue;
      }

      if (!APPLY) {
        result.orphansDryRun.push(id);
        reconcileTotal.inc({ outcome: 'dry_run_orphan' });
        // eslint-disable-next-line no-console
        console.log('[dry-run] would uninstall orphan installation', id);
        continue;
      }

      try {
        await deleteInstallation(appId, key, id);
        result.revoked.push(id);
        reconcileTotal.inc({ outcome: 'orphan_revoked' });
        // eslint-disable-next-line no-console
        console.log('uninstalled orphan installation', id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        result.failed.push({ id, reason });
        reconcileTotal.inc({ outcome: 'orphan_failed' });
        // eslint-disable-next-line no-console
        console.error('orphan uninstall failed', { id, reason });
      }
    }

    // Reverse direction (log-only): DB knows an install GitHub no longer lists.
    const githubIds = new Set(installations.map((i) => String(i.id)));
    result.staleDb = [...known].filter((k) => !githubIds.has(k));
    if (result.staleDb.length > 0) {
      reconcileTotal.inc({ outcome: 'stale_db' }, result.staleDb.length);
      // eslint-disable-next-line no-console
      console.warn(
        'stale_db_connection — installation absent on GitHub but present in RDS',
        result.staleDb,
      );
    }

    await pushMetrics();
    await pool.end();
    return result;
  } catch (err) {
    await pushMetrics();
    await pool.end();
    throw err;
  }
}

main()
  .then((res) => {
    // eslint-disable-next-line no-console
    console.log('reconcile summary', res);
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('reconcile failed', err);
    process.exit(1);
  });
