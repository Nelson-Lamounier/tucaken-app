/** @format */
import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock pg pool — routes the two COUNT queries by table name so the /stats
// route sees distinct user/resume totals. Registered BEFORE the dynamic import.
// ---------------------------------------------------------------------------
jest.unstable_mockModule('../lib/pg.js', () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (sql.includes('FROM users')) return { rows: [{ count: '3' }] };
      if (sql.includes('FROM resumes')) return { rows: [{ count: '7' }] };
      return { rows: [] };
    },
  }),
}));

const { createPublicRouter } = await import('./public.js');

const router = createPublicRouter({} as never);

describe('public router — GET /stats', () => {
  it('returns aggregate user and resume counts as numbers', async () => {
    const res = await router.request('/stats');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: number; resumes: number };
    expect(body).toEqual({ users: 3, resumes: 7 });
  });
});
