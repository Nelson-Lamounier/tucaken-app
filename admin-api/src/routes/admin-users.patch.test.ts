import { jest } from '@jest/globals';

const adminUpdateUserMock = jest.fn<() => Promise<boolean>>();
jest.unstable_mockModule('../lib/repositories/users.js', () => ({
  listUsers: jest.fn(), getAdminUserById: jest.fn(),
  restoreSoftDeletedUser: jest.fn(), adminUpdateUser: adminUpdateUserMock,
}));
const connectMock = jest.fn(async () => ({
  query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
  release: jest.fn(),
}));
jest.unstable_mockModule('../lib/pg.js', () => ({ getPool: () => ({ connect: connectMock }) }));

const { createAdminUsersRouter } = await import('./admin-users.js');
const CONFIG = {} as never;

describe('PATCH /api/admin/users/:userId', () => {
  it('rejects an invalid plan value with 400', async () => {
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/11111111-1111-1111-1111-111111111111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'gold' }),
    });
    expect(res.status).toBe(400);
  });

  it('applies a valid role change', async () => {
    adminUpdateUserMock.mockResolvedValueOnce(true);
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/11111111-1111-1111-1111-111111111111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; updated: boolean };
    expect(body.updated).toBe(true);
  });
});
