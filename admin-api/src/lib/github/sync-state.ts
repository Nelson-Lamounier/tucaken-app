/**
 * @format
 * Ingestion dedup guards — shared by every route that dispatches an ingestion
 * Job from a non-pending state: user-facing connect (POST /connected-repos),
 * admin trigger, retry, and the push webhook. Single source of truth so the
 * claim SQL cannot drift between call sites.
 *
 * NOT used by the deferred-sync path (deferSync → POST /connected-repos/sync →
 * autoDispatchRepos). That flow deliberately parks repos in sync_status
 * 'pending' BEFORE dispatch, so claiming here would reject its own queue. Its
 * dedup is the `last_sync_triggered_at IS NULL` predicate on the pending SELECT,
 * not this lock.
 *
 * Why a guard exists: dispatch is fire-and-forget (the handler returns 202 and
 * never awaits the Job). Without a guard, a double-click or a webhook + manual
 * trigger racing each other create two concurrent Jobs for the same (user,
 * repo), which then race writes on document_embeddings. repo_sync_state PK is
 * (user_id, repo_full_name) — exactly one row per repo — so a conditional
 * UPDATE on sync_status is the lock.
 */
import type { Queryable } from '../pg.js';

/** sync_status values that mean a Job is already running for this repo. */
const IN_FLIGHT = ['pending', 'syncing'] as const;

/**
 * Cheap, non-mutating check: is a Job already in flight for this repo? Use as a
 * fast path BEFORE consuming quota so duplicates never burn a monthly credit.
 * Not race-free on its own — pair with {@link tryClaimSyncSlot} at dispatch.
 */
export async function isSyncInFlight(
    db: Queryable,
    userId: string,
    repoFullName: string,
): Promise<boolean> {
    const { rows } = await db.query<{ sync_status: string | null }>(
        `SELECT sync_status FROM repo_sync_state
         WHERE user_id = $1::uuid AND repo_full_name = $2`,
        [userId, repoFullName],
    );
    const status = rows[0]?.sync_status;
    return status === 'pending' || status === 'syncing';
}

/**
 * Atomically claim the ingestion slot for (user, repo). Returns false when a
 * Job is already in flight — the caller MUST skip dispatch.
 *
 * Race-free by construction: a single INSERT … ON CONFLICT DO UPDATE … WHERE
 * statement, so two rapid triggers cannot both observe a stale 'complete'
 * status and both dispatch (the check-then-act gap a separate SELECT leaves
 * open). The conditional UPDATE is the lock.
 */
export async function tryClaimSyncSlot(
    db: Queryable,
    userId: string,
    repoFullName: string,
): Promise<boolean> {
    const { rows } = await db.query<{ repo_full_name: string }>(
        `INSERT INTO repo_sync_state (user_id, repo_full_name, sync_status, error_message)
         VALUES ($1::uuid, $2, 'pending', NULL)
         ON CONFLICT (user_id, repo_full_name)
         DO UPDATE SET sync_status = 'pending', error_message = NULL
             WHERE repo_sync_state.sync_status NOT IN ('pending', 'syncing')
         RETURNING repo_full_name`,
        [userId, repoFullName],
    );
    return rows.length > 0;
}

export { IN_FLIGHT };
