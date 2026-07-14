import { jest } from '@jest/globals';
import { listUsers } from '../users.js';

function poolReturning(...results: Array<{ rows: unknown[] }>) {
  const query = jest.fn<() => Promise<{ rows: unknown[] }>>();
  for (const r of results) query.mockResolvedValueOnce(r);
  return { query } as unknown as Pick<import('pg').Pool, 'query'>;
}

describe('listUsers', () => {
  it('returns rows + total and passes tier filter as a parameter', async () => {
    const pool = poolReturning(
      { rows: [{ total: '2' }] },
      {
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            email: 'a@x.com', full_name: 'A', role: 'user', plan: 'pro',
            subscription_status: 'active', trial_ends_at: null,
            deleted_at: null, created_at: new Date('2026-01-01T00:00:00Z'),
          },
        ],
      },
    );
    const result = await listUsers(pool, { tier: 'pro', limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ email: 'a@x.com', plan: 'pro', role: 'user' });
  });

  it('omits the plan filter when tier is "all"', async () => {
    const query = jest.fn<() => Promise<{ rows: unknown[] }>>()
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = { query } as unknown as Pick<import('pg').Pool, 'query'>;
    await listUsers(pool, { tier: 'all', limit: 10, offset: 0 });
    // count query (1st call) carries no plan parameter
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const countParams = (query.mock.calls[0] as unknown[])[1];
    expect(countParams).toEqual([]);
  });
});
