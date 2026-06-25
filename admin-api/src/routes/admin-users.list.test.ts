import { jest } from '@jest/globals';
import type { AdminUserDetailRow, AdminUserRow } from '../lib/repositories/users.js';

const listUsersMock = jest.fn<
  () => Promise<{ rows: AdminUserRow[]; total: number }>
>();
const getAdminUserByIdMock = jest.fn<
  () => Promise<AdminUserDetailRow | null>
>();

jest.unstable_mockModule('../lib/repositories/users.js', () => ({
  listUsers: listUsersMock,
  getAdminUserById: getAdminUserByIdMock,
  restoreSoftDeletedUser: jest.fn(),
}));
jest.unstable_mockModule('../lib/pg.js', () => ({ getPool: () => ({}) }));

const { createAdminUsersRouter } = await import('./admin-users.js');

const CONFIG = { /* minimal AdminApiConfig stub */ } as never;

describe('GET /api/admin/users', () => {
  it('returns 400 for an invalid tier', async () => {
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/?tier=gold');
    expect(res.status).toBe(400);
  });

  it('returns users + total for a valid request', async () => {
    listUsersMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'a@x.com' } as AdminUserRow],
      total: 1,
    });
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/?tier=pro');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: AdminUserRow[]; total: number };
    expect(body.total).toBe(1);
    expect(body.users).toHaveLength(1);
  });

  it('returns 404 when detail user is missing', async () => {
    getAdminUserByIdMock.mockResolvedValueOnce(null);
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/11111111-1111-1111-1111-111111111111');
    expect(res.status).toBe(404);
  });
});
