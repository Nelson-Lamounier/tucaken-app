/**
 * @format
 * admin-api — Ingestion trigger route.
 *
 * Phase 3 cut-over: replaces the legacy API Gateway → Trigger Lambda → Fetcher
 * Lambda → Worker Lambda chain with a single in-cluster K8s Job.
 *
 * Routes:
 *   POST /api/admin/ingestion/trigger — accepts { repoFullName, forceReindex? }
 *                                       (userId = provisioned platform users.id)
 *                                       creates a Job in the ingestion namespace,
 *                                       returns 202 { status, jobName }.
 */
import { createHash } from 'node:crypto';

import type { V1Job } from '@kubernetes/client-node';
import type { Pool } from 'pg';
import { Hono } from 'hono';

import type { AdminApiBindings } from '../../lib/types.js';
import type { AdminApiConfig } from '../../lib/config.js';
import { getJobImage, isImageConfigured } from '../../lib/config.js';
import { getPool } from '../../lib/pg.js';
import { tryClaimSyncSlot } from '../../lib/github/sync-state.js';
import { getBatchApi } from '../../lib/jobs/k8s.js';
import { traceParentEnv, observabilityEnv, ingestionModelEnv, MODEL_JOB_BACKOFF_LIMIT } from '../../lib/jobs/k8s-job-builder.js';
import { buildIngestionJobSpec } from '../../lib/jobs/ingestion-job.js';
import { getCachedTierConfig } from '../../lib/billing/tier-config-cache.js';

const REPO_FULL_NAME_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const MAX_NAME_LEN = 63;

function sanitizeLabel(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_NAME_LEN);
}

interface TriggerBody {
    readonly repoFullName?:  string;
    readonly forceReindex?:  boolean;
}


/**
 * Resolve the immutable numeric GitHub repo id from the repositories row (PR4
 * dual-writes it). Returns null pre-backfill — the builder then omits the env.
 */
async function lookupGithubRepoId(
    pool: Pool,
    userId: string,
    repoFullName: string,
): Promise<number | null> {
    const r = await pool.query<{ github_repo_id: string | null }>(
        `SELECT github_repo_id FROM repositories
         WHERE user_id = $1::uuid AND provider = 'github' AND full_name = $2`,
        [userId, repoFullName],
    );
    const raw = r.rows[0]?.github_repo_id;
    if (raw === null || raw === undefined) return null;
    // pg returns bigint columns as strings; coerce and guard.
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) ? id : null;
}

/**
 * Lightweight rollup-refresh Job — recomputes a user's profile rollup +
 * synthesis WITHOUT re-embedding. Backfills users whose synthesis columns are
 * NULL and powers a "Regenerate profile" action. Reuses the ingestion image
 * (command → dist/run-rollup.js). Shorter deadline: no GitHub fetch / embedding.
 */
function buildRollupJobSpec(
    cfg: AdminApiConfig,
    image: string,
    userId: string,
    timestamp: number,
): V1Job {
    const safeUserId = sanitizeLabel(userId);
    const suffix     = createHash('sha1').update(`rollup:${userId}:${timestamp}`).digest('hex').slice(0, 8);
    const jobName    = `rollup-${safeUserId}-${suffix}`.slice(0, MAX_NAME_LEN);

    return {
        apiVersion: 'batch/v1',
        kind:       'Job',
        metadata: {
            name:      jobName,
            namespace: cfg.ingestionNamespace,
            labels:    { app: 'rollup-refresh', userId: safeUserId },
        },
        spec: {
            ttlSecondsAfterFinished: 3600,
            backoffLimit:            MODEL_JOB_BACKOFF_LIMIT,
            activeDeadlineSeconds:   300,
            template: {
                metadata: { labels: { app: 'rollup-refresh', userId: safeUserId } },
                spec: {
                    restartPolicy:      'Never',
                    serviceAccountName: cfg.ingestionServiceAccount,
                    containers: [{
                        name:    'rollup',
                        image,
                        command: ['node', 'dist/run-rollup.js'],
                        env: [
                            ...observabilityEnv('rollup-refresh', `${userId}:${timestamp}`),
                            { name: 'USER_ID', value: userId },
                            ...ingestionModelEnv(cfg),
                            ...(() => { const tp = traceParentEnv(); return tp ? [tp] : []; })(),
                        ],
                        envFrom: [
                            { secretRef: { name: 'platform-rds-credentials' } },
                            { secretRef: { name: 'ingestion-secrets' } },
                        ],
                        resources: {
                            requests: { memory: '256Mi', cpu: '150m' },
                            limits:   { memory: '512Mi', cpu: '500m' },
                        },
                    }],
                },
            },
        },
    };
}

export function createIngestionRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    // Dispatch a rollup-refresh Job for the authenticated user (no re-embed).
    // Self-service "regenerate profile" + the backfill path for users whose
    // synthesis columns are NULL.
    router.post('/rollup-refresh', async (ctx) => {
        const userId = ctx.get('userId');
        if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

        const ingestionImage = getJobImage('ingestion');
        if (!isImageConfigured(ingestionImage)) {
            console.error('[rollup-refresh] image URI unresolved — admin-api-job-images Secret not yet synced', { value: ingestionImage });
            return ctx.json({ error: 'Ingestion image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
        }

        const job = buildRollupJobSpec(config, ingestionImage, userId, Date.now());
        try {
            await getBatchApi().createNamespacedJob({ namespace: config.ingestionNamespace, body: job });
        } catch (err: unknown) {
            console.error('[rollup-refresh] failed to create K8s Job', err);
            return ctx.json({ error: 'Failed to schedule rollup-refresh Job' }, 502);
        }

        return ctx.json({ status: 'queued', jobName: job.metadata!.name!, userId }, 202);
    });

    router.post('/trigger', async (ctx) => {
        // The provisioned platform users.id (set by userProvisionMiddleware),
        // NOT the Cognito sub. repository_profiles.user_id FKs to users.id,
        // so passing the sub here violates the FK on every run. Matches the
        // strategist/article pipeline routes.
        const userId = ctx.get('userId');
        if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

        let body: TriggerBody;
        try {
            body = await ctx.req.json<TriggerBody>();
        } catch {
            return ctx.json({ error: 'Body must be valid JSON' }, 400);
        }

        const repoFullName = body.repoFullName?.trim();
        const forceReindex = body.forceReindex ?? false;

        if (!repoFullName)                           return ctx.json({ error: '"repoFullName" is required' }, 400);
        if (!REPO_FULL_NAME_RE.test(repoFullName))   return ctx.json({ error: '"repoFullName" must match owner/repo' }, 400);

        // Resolve the current ingestion image URI from the file mount
        // (kubelet auto-updates it when ESO refreshes the upstream Secret).
        const ingestionImage = getJobImage('ingestion');
        if (!isImageConfigured(ingestionImage)) {
            console.error('[ingestion] image URI unresolved — admin-api-job-images Secret not yet synced', { value: ingestionImage });
            return ctx.json({ error: 'Ingestion image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
        }

        // Dedup: skip if a Job is already in flight for this repo. The admin
        // trigger has no quota gate, so an unguarded re-trigger would race a
        // live Job's writes on document_embeddings. tryClaimSyncSlot is the
        // atomic lock; claiming here also stamps sync_status='pending'. Placed
        // after the image check so a 502 never leaves a stuck 'pending'.
        const pool = getPool(config);
        if (!(await tryClaimSyncSlot(pool, userId, repoFullName))) {
            return ctx.json({ status: 'already_running', userId, repoFullName }, 200);
        }

        const githubRepoId = await lookupGithubRepoId(pool, userId, repoFullName);
        // Fetch the live tier config so enrichment depth reflects DB-configured
        // tiers (60 s cache — effectively free).
        const tierConfig = await getCachedTierConfig(pool);
        const job = buildIngestionJobSpec(config, ingestionImage, userId, repoFullName, forceReindex, Date.now(), {
            extraSecretRefs: ['ingestion-secrets'],
            githubRepoId,
            tierConfig,
        });

        try {
            // @kubernetes/client-node v1.x switched to options-object API.
            await getBatchApi().createNamespacedJob({ namespace: config.ingestionNamespace, body: job });
        } catch (err: unknown) {
            console.error('[ingestion] failed to create K8s Job', err);
            // Release the claim so a failed dispatch doesn't leave a stuck
            // 'pending' that blocks every future trigger for this repo.
            await pool.query(
                `UPDATE repo_sync_state SET sync_status = 'error', error_message = 'JOB_DISPATCH_FAILED'
                 WHERE user_id = $1::uuid AND repo_full_name = $2`,
                [userId, repoFullName],
            ).catch(() => {});
            return ctx.json({ error: 'Failed to schedule ingestion Job' }, 502);
        }

        return ctx.json({
            status:       'queued',
            jobName:      job.metadata!.name!,
            userId,
            repoFullName,
            forceReindex,
        }, 202);
    });

    return router;
}
