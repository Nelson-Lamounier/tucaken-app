/**
 * @format
 * Best-effort rollup-refresh dispatch — spawns the run-rollup.js Job so the
 * user's Profile Intelligence (rollup + Mirror/Direction/Reconciliation/
 * Diagnostic synthesis) recomputes without a repo re-ingest.
 *
 * Callers: repo delete (drop the removed repo from the aggregate) and resume
 * import confirm (the Reconciliation tab compares the rollup against the
 * imported resume, so a new resume must re-trigger synthesis or the panel
 * keeps judging the OLD resume until the next repo sync).
 *
 * MUST NOT throw — profile freshness is never worth failing the caller's
 * action; the rollup self-heals on the next repo sync regardless.
 */
import type { AdminApiConfig } from '../config.js';
import { getJobImage, isImageConfigured } from '../config.js';
import { buildRollupJobSpec } from './ingestion-job.js';
import { dispatchJob } from './dispatch.js';

export async function dispatchRollupRefresh(
    config: AdminApiConfig,
    userId: string,
    reason: string,
): Promise<boolean> {
    try {
        const image = getJobImage('ingestion');
        if (!isImageConfigured(image)) return false;
        const job = buildRollupJobSpec(config, image, userId, Date.now());
        await dispatchJob(config.ingestionNamespace, job);
        return true;
    } catch (err) {
        console.warn(`[rollup] refresh dispatch failed (${reason}, non-fatal)`, err);
        return false;
    }
}
