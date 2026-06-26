/**
 * @format
 * Webhook event de-duplication.
 *
 * Stripe delivers each event at-least-once and retries on non-2xx. The
 * conditional writes in the subscription sync already prevent stale overwrites,
 * but this gives an explicit idempotency guard + an audit trail: the first time
 * an event id is seen it is claimed; later deliveries are recognised and
 * skipped by the caller.
 *
 * Backed by the `webhook_events_seen` table (migration in platform-rds-bootstrap).
 */
import type { Pool } from 'pg';

type Queryable = Pick<Pool, 'query'>;

/**
 * Atomically claim a webhook event id. Returns true when this is the FIRST time
 * the id has been seen (the caller should process it), false when it was already
 * recorded (a duplicate delivery the caller should skip).
 */
export async function markWebhookEventSeen(
  db: Queryable,
  eventId: string,
  type: string,
): Promise<boolean> {
  const res = await db.query(
    `INSERT INTO webhook_events_seen (event_id, type)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, type],
  );
  return (res.rowCount ?? 0) > 0;
}
