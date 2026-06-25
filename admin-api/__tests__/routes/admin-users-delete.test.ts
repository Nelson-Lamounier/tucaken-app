/** @format */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { Hono } from 'hono'

const softDeleteUser = jest.fn<() => Promise<boolean>>()
const getAdminUserById = jest.fn<() => Promise<{ role: string } | null>>()
const adminDisableUser = jest.fn<() => Promise<void>>()
const purgeUser = jest.fn<() => Promise<unknown>>()
const getPool = jest.fn(() => ({
  query: jest.fn(async () => ({ rows: [{ cognito_sub: 'sub-target' }] })),
}))

jest.unstable_mockModule('../../src/lib/repositories/users.js', () => ({
  softDeleteUser, getAdminUserById,
  // re-export the other named members the router imports (directly or via github.js), as no-op mocks:
  listUsers: jest.fn(), adminUpdateUser: jest.fn(), restoreSoftDeletedUser: jest.fn(),
  hardDeleteUser: jest.fn(), getUserPlanStatus: jest.fn(),
}))
jest.unstable_mockModule('../../src/lib/cognito-admin.js', () => ({
  adminDisableUser, adminEnableUser: jest.fn(),
}))
jest.unstable_mockModule('../../src/lib/purge-user.js', () => ({ purgeUser }))
jest.unstable_mockModule('../../src/lib/github-uninstall.js', () => ({ revokeGitHubInstallationForUser: jest.fn() }))
jest.unstable_mockModule('../../src/routes/github.js', () => ({
  deleteConnection: jest.fn(), createGithubRouter: jest.fn(),
}))
jest.unstable_mockModule('../../src/lib/pg.js', () => ({ getPool }))

const { createAdminUsersRouter } = await import('../../src/routes/admin-users.js')

const TARGET = '11111111-1111-1111-1111-111111111111'
const CALLER = '22222222-2222-2222-2222-222222222222'
const cfg = { cognitoUserPoolId: 'pool', awsRegion: 'eu-west-1', githubAppId: 'a', githubPrivateKey: 'k' } as never

function appWithCaller(callerId: string) {
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('userId', callerId); await next() })
  app.route('/', createAdminUsersRouter(cfg))
  return app
}

beforeEach(() => { jest.clearAllMocks(); getAdminUserById.mockResolvedValue({ role: 'user' }) })

describe('DELETE /:userId', () => {
  it('soft-deletes: disables Cognito and sets deleted_at', async () => {
    softDeleteUser.mockResolvedValue(true)
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft', reason: 'spam' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'soft', alreadyDeleted: false })
    expect(adminDisableUser).toHaveBeenCalledTimes(1)
    expect(softDeleteUser).toHaveBeenCalledWith(expect.anything(), TARGET, 'spam')
  })

  it('hard-deletes via purgeUser and returns the outcome', async () => {
    purgeUser.mockResolvedValue({ githubUninstall: 'revoked', cognitoDeleted: true, dbDeleted: true })
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'hard' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, mode: 'hard', outcome: { githubUninstall: 'revoked' } })
    expect(purgeUser).toHaveBeenCalledTimes(1)
  })

  it('refuses to delete your own account (403)', async () => {
    const res = await appWithCaller(TARGET).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'CannotDeleteSelf' })
  })

  it('refuses to delete another admin (403)', async () => {
    getAdminUserById.mockResolvedValue({ role: 'admin' })
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'CannotDeleteAdmin' })
  })

  it('404 when the user does not exist', async () => {
    getAdminUserById.mockResolvedValue(null)
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(404)
  })

  it('400 on malformed UUID', async () => {
    const res = await appWithCaller(CALLER).request('/not-a-uuid', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(400)
  })
})
