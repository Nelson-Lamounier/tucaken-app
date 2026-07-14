/** @format */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { Hono } from 'hono'

const revoke = jest.fn<() => Promise<string>>()
const deleteConnection = jest.fn<() => Promise<void>>()
const getAdminUserById = jest.fn<() => Promise<{ role: string } | null>>()
const getPool = jest.fn(() => ({ query: jest.fn(async () => ({ rows: [] })) }))

jest.unstable_mockModule('../../../lib/github/github-uninstall.js', () => ({ revokeGitHubInstallationForUser: revoke }))
jest.unstable_mockModule('../../../lib/github/connection.js', () => ({ deleteConnection }))
jest.unstable_mockModule('../../../lib/repositories/users.js', () => ({
  getAdminUserById, softDeleteUser: jest.fn(), listUsers: jest.fn(),
  adminUpdateUser: jest.fn(), restoreSoftDeletedUser: jest.fn(),
  hardDeleteUser: jest.fn(),
}))
jest.unstable_mockModule('../../../lib/pg.js', () => ({ getPool }))

const { createAdminUsersRouter } = await import('../../admin/admin-users.js')

const TARGET = '11111111-1111-1111-1111-111111111111'
const cfg = { cognitoUserPoolId: 'pool', awsRegion: 'eu-west-1', githubAppId: 'a', githubPrivateKey: 'k' } as never

function app() {
  const a = new Hono()
  a.use('*', async (c, next) => { c.set('userId', '22222222-2222-2222-2222-222222222222'); await next() })
  a.route('/', createAdminUsersRouter(cfg))
  return a
}

beforeEach(() => { jest.clearAllMocks(); getAdminUserById.mockResolvedValue({ role: 'user' }) })

describe('DELETE /:userId/github', () => {
  it('revokes the App and clears the connection', async () => {
    revoke.mockResolvedValue('revoked')
    const res = await app().request(`/${TARGET}/github`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, disconnected: true, githubUninstall: 'revoked' })
    expect(deleteConnection).toHaveBeenCalledTimes(1)
  })

  it('reports disconnected:false when there was no connection', async () => {
    revoke.mockResolvedValue('not_connected')
    const res = await app().request(`/${TARGET}/github`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, disconnected: false, githubUninstall: 'not_connected' })
  })

  it('404 when the user does not exist', async () => {
    getAdminUserById.mockResolvedValue(null)
    const res = await app().request(`/${TARGET}/github`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
