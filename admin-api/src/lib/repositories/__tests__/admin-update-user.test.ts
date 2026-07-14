import { jest } from '@jest/globals';
import { adminUpdateUser } from '../users.js';

function fakeClient() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    // first SELECT returns the current row
    if (sql.includes('SELECT plan, role')) {
      return { rows: [{ plan: 'free', role: 'user' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  return { client: { query } as unknown as import('pg').PoolClient, calls };
}

describe('adminUpdateUser', () => {
  it('updates plan and writes an admin_manual_override plan_events row', async () => {
    const { client, calls } = fakeClient();
    const ok = await adminUpdateUser(client, 'u1', { plan: 'pro' });
    expect(ok).toBe(true);
    const eventInsert = calls.find((c) => c.sql.includes('INTO plan_events'));
    expect(eventInsert).toBeDefined();
    expect(eventInsert!.params).toContain('admin_manual_override');
  });

  it('returns false and writes nothing when patch is empty', async () => {
    const { client, calls } = fakeClient();
    const ok = await adminUpdateUser(client, 'u1', {});
    expect(ok).toBe(false);
    expect(calls.some((c) => c.sql.includes('UPDATE users'))).toBe(false);
  });
});
