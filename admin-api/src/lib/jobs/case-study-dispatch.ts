/**
 * @format
 * Case-study Job dispatch.
 *
 * Used by the projects routes (/:id/confirm best-effort, /:id/regenerate
 * strict — the caller propagates the failure) and by the case-study
 * reconciler interval loop. Returns a discriminated union so callers can
 * distinguish "user can retry later" failures (image not yet configured,
 * K8s rejection) from "data integrity broken" failures (pipeline_runs
 * INSERT failed).
 *
 * The case-study Job reads commit/PR evidence from RDS (repo_commits /
 * repo_pull_requests), so it needs no GitHub token — ingestion is the only
 * GitHub scan.
 *
 * `triggeredBy` lands on pipeline_runs.metadata so analytics can split
 * confirm-driven from manual regenerations.
 */
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { getJobImage, isImageConfigured, type AdminApiConfig } from '../config.js';
import { withUser } from '../pg.js';
import { insertPipelineRun } from '../repositories/pipeline-runs.js';
import { buildPipelineJob, sanitizeLabel } from './k8s-job-builder.js';
import { dispatchJob } from './dispatch.js';

// Non-secret redis-cache connection env for the job-strategist Jobs
// (case-study + clustering). The password is mounted separately via the
// job-strategist-redis-cache secret (envFromSecretRefs). When the secret is
// absent the Jobs fail-open to "cache disabled" and run uncached — never broken.
export const REDIS_CACHE_ENV: { name: string; value: string }[] = [
    { name: 'REDIS_CACHE_HOST', value: 'redis-cache-master.redis-cache.svc.cluster.local' },
    { name: 'REDIS_CACHE_PORT', value: '6379' },
    { name: 'REDIS_CACHE_TLS',  value: 'false' },
];

export type DispatchResult =
    | { ok: true; pipelineRunId: string; jobName: string }
    | { ok: false; fatal: boolean; reason: string };

export async function dispatchCaseStudyJob(
    pool: Pool,
    config: AdminApiConfig,
    userId: string,
    projectId: string,
    triggeredBy: 'confirm' | 'manual' | 'reconciler',
): Promise<DispatchResult> {
    const image = getJobImage('job-strategist');
    if (!isImageConfigured(image)) {
        return { ok: false, fatal: false, reason: 'image_not_configured' };
    }

    const pipelineRunId = randomUUID();
    try {
        await withUser(pool, userId, async (db) => {
            await insertPipelineRun(db, {
                id:           pipelineRunId,
                userId,
                pipelineType: 'case_study',
                referenceId:  projectId,
                metadata:     { projectId, triggeredBy, dispatchedImage: image },
            });
        });
    } catch (err) {
        console.error('[projects/dispatch] failed to insert pipeline_run', err);
        return { ok: false, fatal: true, reason: 'pipeline_run_insert_failed' };
    }

    const job = buildPipelineJob({
        namespace:          config.strategistPipelineNamespace,
        image,
        serviceAccountName: config.strategistPipelineServiceAccount,
        nameStem:           `proj-cs-${sanitizeLabel(projectId).slice(0, 16)}`,
        suffixInput:        `${pipelineRunId}:${projectId}:${Date.now()}`,
        labels: {
            app:        'project-case-study',
            userId:     sanitizeLabel(userId),
            projectId:  sanitizeLabel(projectId),
            trigger:    triggeredBy,
        },
        command: ['node', 'dist/run-case-study.js'],
        env: [
            { name: 'CASE_STUDY_PIPELINE_RUN_ID', value: pipelineRunId },
            { name: 'PROJECT_ID',                 value: projectId },
            { name: 'USER_ID',                    value: userId },
            // Enable article topic discovery as a byproduct of case-study
            // generation (Gap 2). Fail-open in the orchestrator — never blocks
            // or slows the case-study run.
            { name: 'ARTICLE_TOPIC_DISCOVERY',    value: '1' },
            ...REDIS_CACHE_ENV,
        ],
        envFromSecretRefs: ['platform-rds-credentials', 'job-strategist-redis-cache'],
    });

    try {
        await dispatchJob(config.strategistPipelineNamespace, job);
    } catch (err) {
        console.error('[projects/dispatch] failed to create K8s Job', err);
        return { ok: false, fatal: false, reason: 'k8s_create_failed' };
    }

    return { ok: true, pipelineRunId, jobName: job.metadata!.name! };
}
