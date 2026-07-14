/**
 * @format
 * admin-api — Project clustering routes.
 *
 * Routes (mounted under /api/admin/projects by the projects.ts facade,
 * BEFORE the core /:id routes so literal paths are not captured as ids):
 *   GET  /clustering/proposals — list current unconfirmed AI proposals
 *   POST /clustering/run       — fire-and-forget clustering K8s Job
 */
import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { getJobImage, isImageConfigured } from '../../lib/config.js';
import { REDIS_CACHE_ENV } from '../../lib/jobs/case-study-dispatch.js';
import { buildPipelineJob, sanitizeLabel } from '../../lib/jobs/k8s-job-builder.js';
import { getBatchApi } from '../../lib/jobs/k8s.js';
import { getPool, withUser } from '../../lib/pg.js';
import { insertPipelineRun } from '../../lib/repositories/pipeline-runs.js';
import { listProjects } from '../../lib/repositories/projects.js';
import { AdminApiBindings, requireUserId } from '../../lib/types.js';

export function createProjectsClusteringRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    router.onError((err, ctx) => {
        const status = (err as { status?: number }).status ?? 500;
        console.error(`[projects] ${ctx.req.method} ${ctx.req.path}`, err.message);
        return ctx.json({ error: err.message }, status as 400 | 401 | 403 | 404 | 500);
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /clustering/proposals             — unconfirmed AI proposals
    // ────────────────────────────────────────────────────────────────────
    router.get('/clustering/proposals', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            listProjects(db, { limit: 100, offset: 0, includeArchived: false, proposalsOnly: true }),
        );
        return ctx.json({ items: result.rows });
    });


    // ────────────────────────────────────────────────────────────────────
    // POST /clustering/run               — fire-and-forget clustering Job
    // ────────────────────────────────────────────────────────────────────
    router.post('/clustering/run', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const pool = getPool(config);

        // Pro-only: multi_repo clustering is a paid feature. Hard server guard
        // (the UI also hides the trigger for non-pro, but never trust the client).
        const planRes = await pool.query<{ plan: string }>(
            `SELECT plan FROM users WHERE id = $1::uuid`,
            [uid],
        );
        if ((planRes.rows[0]?.plan ?? 'free') !== 'pro') {
            return ctx.json({ error: 'Multi-repo projects require Pro' }, 403);
        }

        const image = getJobImage('job-strategist');
        if (!isImageConfigured(image)) {
            console.error('[projects/clustering] image URI unresolved');
            return ctx.json({ error: 'Strategist pipeline image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
        }

        const pipelineRunId = randomUUID();

        try {
            await withUser(pool, uid, async (db) => {
                await insertPipelineRun(db, {
                    id:           pipelineRunId,
                    userId:       uid,
                    pipelineType: 'clustering',
                    referenceId:  null,
                    metadata:     { triggeredBy: 'manual', dispatchedImage: image },
                });
            });
        } catch (err) {
            console.error('[projects/clustering] failed to insert pipeline_run', err);
            return ctx.json({ error: 'Failed to record pipeline run' }, 500);
        }

        const job = buildPipelineJob({
            namespace:          config.strategistPipelineNamespace,
            image,
            serviceAccountName: config.strategistPipelineServiceAccount,
            nameStem:           `proj-cluster-${sanitizeLabel(uid).slice(0, 16)}`,
            suffixInput:        `${pipelineRunId}:${Date.now()}`,
            labels: {
                app:    'project-clustering',
                userId: sanitizeLabel(uid),
            },
            command: ['node', 'dist/run-clustering.js'],
            env: [
                { name: 'CLUSTERING_PIPELINE_RUN_ID', value: pipelineRunId },
                { name: 'USER_ID',                    value: uid },
                ...REDIS_CACHE_ENV,
            ],
            envFromSecretRefs: ['platform-rds-credentials', 'job-strategist-redis-cache'],
        });

        try {
            await getBatchApi().createNamespacedJob({
                namespace: config.strategistPipelineNamespace,
                body:      job,
            });
        } catch (err) {
            console.error('[projects/clustering] failed to create K8s Job', err);
            return ctx.json({ error: 'Failed to schedule clustering Job' }, 502);
        }

        return ctx.json({
            status:        'queued',
            pipelineRunId,
            jobName:       job.metadata!.name!,
        }, 202);
    });


    return router;
}
