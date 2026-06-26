/**
 * @format
 * Per-user dispatch gate for the strategist (JD-analysis) pipeline.
 *
 * Two abuse controls in one race-safe check:
 *   - in-flight dedup: a user may have only ONE non-terminal strategist run.
 *   - min-interval throttle: a user cannot start runs faster than minIntervalSec.
 *
 * MUST be called inside the withUser() transaction, BEFORE the pipeline_run is
 * inserted: it takes a transaction-scoped advisory lock keyed on the user, so
 * the lock + the in-flight read + the subsequent INSERT are atomic against
 * concurrent triggers from the same user (different tabs/devices/scripts).
 * Read-committed alone would let two simultaneous requests both miss each
 * other's uncommitted run — the lock serialises them.
 */
import type { PoolClient } from 'pg';

export type StrategistDispatchGate = 'ok' | 'in_flight' | 'throttled';

/**
 * A non-terminal run older than this is treated as stale (the K8s Job's
 * activeDeadlineSeconds=1800 would have force-failed it), so it no longer blocks
 * the user — prevents a hung run from locking a user out permanently.
 */
const STALE_RUN_SEC = 1800;

const TERMINAL_STATUSES = new Set(['complete', 'failed']);

export async function claimStrategistDispatch(
  db: PoolClient,
  userId: string,
  minIntervalSec: number,
  staleRunSec: number = STALE_RUN_SEC,
): Promise<StrategistDispatchGate> {
  // Serialise concurrent dispatches for THIS user (released on COMMIT/ROLLBACK).
  // Two int4 keys: per-user hash + a constant namespace for this lock class.
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext('strategist-dispatch'))`, [userId]);

  const { rows } = await db.query<{ status: string; age_sec: number }>(
    `SELECT status, EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_sec
       FROM pipeline_runs
      WHERE user_id = $1::uuid AND pipeline_type = 'strategist'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId],
  );

  const last = rows[0];
  if (!last) return 'ok';

  const isTerminal = TERMINAL_STATUSES.has(last.status);
  if (!isTerminal && last.age_sec < staleRunSec) return 'in_flight';
  if (last.age_sec < minIntervalSec) return 'throttled';
  return 'ok';
}
