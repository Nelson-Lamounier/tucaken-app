/** @format */
import { jest } from '@jest/globals';
import { markWebhookEventSeen } from './webhook-events.js';

function fakeDb(rowCount: number) {
  return {
    query: jest.fn(async (_sql: string, _params: unknown[]) => ({
      rows: rowCount ? [{ event_id: 'evt_1' }] : [],
      rowCount,
    })),
  };
}

describe('markWebhookEventSeen', () => {
  it('returns true when the event id is inserted for the first time', async () => {
    const db = fakeDb(1);
    expect(await markWebhookEventSeen(db as never, 'evt_1', 'invoice.paid')).toBe(true);
    const call = db.query.mock.calls[0];
    if (!call) throw new Error('query was not called');
    const [sql, params] = call;
    expect(sql).toContain('INSERT INTO webhook_events_seen');
    expect(sql).toContain('ON CONFLICT (event_id) DO NOTHING');
    expect(params).toEqual(['evt_1', 'invoice.paid']);
  });

  it('returns false on a duplicate (ON CONFLICT → no row)', async () => {
    const db = fakeDb(0);
    expect(await markWebhookEventSeen(db as never, 'evt_1', 'invoice.paid')).toBe(false);
  });
});
