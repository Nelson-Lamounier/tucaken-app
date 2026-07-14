import { jest } from '@jest/globals';
import { getAdminUserById } from '../users.js';

function poolReturning(...results: Array<{ rows: unknown[] }>) {
  const query = jest.fn<() => Promise<{ rows: unknown[] }>>();
  for (const r of results) query.mockResolvedValueOnce(r);
  return { query } as unknown as Pick<import('pg').Pool, 'query'>;
}

describe('getAdminUserById', () => {
  it('returns null when the user row is absent', async () => {
    const pool = poolReturning({ rows: [] });
    expect(await getAdminUserById(pool, 'missing')).toBeNull();
  });

  it('maps user row + quotas into AdminUserDetailRow', async () => {
    const pool = poolReturning(
      {
        rows: [{
          id: 'u1', email: 'a@x.com', full_name: 'A', role: 'admin', plan: 'premium',
          subscription_status: 'active', trial_ends_at: null, deleted_at: null,
          created_at: new Date('2026-01-01T00:00:00Z'),
          stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
          current_period_end: new Date('2026-02-01T00:00:00Z'), cancel_at_period_end: false,
        }],
      },
      { rows: [{ feature: 'resume_generations', period_month: '2026-06', count: 3 }] },
    );
    const detail = await getAdminUserById(pool, 'u1');
    expect(detail).not.toBeNull();
    expect(detail!.stripeCustomerId).toBe('cus_1');
    expect(detail!.quotas).toHaveLength(1);
    expect(detail!.quotas[0]).toMatchObject({ feature: 'resume_generations', count: 3 });
  });
});
