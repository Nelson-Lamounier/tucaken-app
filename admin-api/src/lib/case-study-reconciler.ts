/**
 * Case-study reconciler -- light interval loop that dispatches the
 * case-study Job for confirmed projects stuck in case_study_status='pending'.
 *
 * The reconciler runs as a system process (all users) and connects via the
 * postgres owner role, which bypasses non-FORCE RLS on projects and
 * pipeline_runs. No set_config('app.current_user_id') is required here.
 *
 * Debounce / double-dispatch guard: a single NOT EXISTS subquery on
 * pipeline_runs covers both "a run is already active (queued/running)" and
 * "a run was created within the last 120 seconds". Idempotent by design.
 */

import type { Pool } from 'pg';

import type { AdminApiConfig } from './config.js';
import { dispatchCaseStudyJob } from '../routes/projects.js';

const TICK_MS = 30_000;

/** Confirmed projects stuck in case_study_status='pending' with no active
 *  or recently-dispatched pipeline run.
 *
 *  The NOT EXISTS clause covers two cases atomically:
 *    1. A run is already active (status IN ('queued','running')).
 *    2. A run was dispatched within the 120-second debounce window
 *       (prevents double-dispatch when the Job has not yet flipped to
 *       'running').
 */
export async function selectPendingCaseStudies(
    pool: Pool,
): Promise<{ id: string; user_id: string }[]> {
    const { rows } = await pool.query<{ id: string; user_id: string }>(
        `SELECT p.id, p.user_id
           FROM projects p
          WHERE p.is_user_confirmed = TRUE
            AND p.case_study_status = 'pending'
            AND p.status <> 'archived'
            AND NOT EXISTS (
              SELECT 1 FROM pipeline_runs r
               WHERE r.pipeline_type = 'case_study'
                 AND r.reference_id = p.id::text
                 AND (r.status IN ('queued', 'running')
                      OR r.created_at > NOW() - INTERVAL '120 seconds')
            )
          ORDER BY p.updated_at ASC
          LIMIT 20`,
    );
    return rows;
}

type Dispatcher = typeof dispatchCaseStudyJob;

/** Select pending case studies and dispatch one Job per project.
 *
 *  Per-project dispatch errors are caught and logged -- they are non-fatal
 *  so a single bad project does not block the rest of the batch.
 *
 *  Returns the number of Jobs successfully dispatched.
 */
export async function runCaseStudyReconcileTick(
    pool: Pool,
    config: AdminApiConfig,
    dispatch: Dispatcher = dispatchCaseStudyJob,
): Promise<number> {
    const pending = await selectPendingCaseStudies(pool);
    let n = 0;
    for (const p of pending) {
        try {
            const result = await dispatch(pool, config, p.user_id, p.id, 'reconciler');
            if (result.ok) {
                n += 1;
            } else {
                // No pipeline_run row was written, so the next tick retries.
                console.warn(
                    '[case-study-reconciler] dispatch returned not-ok (will retry)',
                    p.id,
                    result.reason,
                );
            }
        } catch (err) {
            console.warn(
                '[case-study-reconciler] dispatch failed (non-fatal)',
                p.id,
                (err as Error).message,
            );
        }
    }
    return n;
}

/** Start the 30-second interval reconciler.
 *
 *  The timer is unref'd so it does not keep the Node process alive in test
 *  or CLI contexts if left running. Returns a stop function.
 */
export function startCaseStudyReconciler(
    pool: Pool,
    config: AdminApiConfig,
): () => void {
    const timer = setInterval(() => {
        void runCaseStudyReconcileTick(pool, config).catch((err) =>
            console.warn(
                '[case-study-reconciler] tick failed (non-fatal)',
                (err as Error).message,
            ),
        );
    }, TICK_MS);
    timer.unref?.();
    return () => clearInterval(timer);
}
