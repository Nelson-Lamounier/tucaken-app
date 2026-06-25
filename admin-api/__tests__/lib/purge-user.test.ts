/** @format */
import { describe, it, expect, jest } from '@jest/globals'

const revokeMock = jest.fn<() => Promise<string>>()
const adminDeleteMock = jest.fn<() => Promise<void>>()
const hardDeleteMock = jest.fn<() => Promise<void>>()

jest.unstable_mockModule('../../src/lib/github-uninstall.js', () => ({
  revokeGitHubInstallationForUser: revokeMock,
}))
jest.unstable_mockModule('../../src/lib/cognito-admin.js', () => ({
  adminDeleteUser: adminDeleteMock,
}))
jest.unstable_mockModule('../../src/lib/repositories/users.js', () => ({
  hardDeleteUser: hardDeleteMock,
}))

const { purgeUser } = await import('../../src/lib/purge-user.js')

const deps = {
  pool: {} as never,
  cognito: {} as never,
  userPoolId: 'pool-1',
  region: 'eu-west-1',
  githubAppId: 'app-1',
  githubPrivateKey: 'key-1',
}

describe('purgeUser', () => {
  it('revokes GitHub, deletes Cognito, then deletes DB — in that order', async () => {
    const order: string[] = []
    revokeMock.mockImplementation(async () => { order.push('github'); return 'revoked' })
    adminDeleteMock.mockImplementation(async () => { order.push('cognito') })
    hardDeleteMock.mockImplementation(async () => { order.push('db') })

    const out = await purgeUser(deps, 'user-1', 'sub-1')

    expect(order).toEqual(['github', 'cognito', 'db'])
    expect(out).toEqual({ githubUninstall: 'revoked', cognitoDeleted: true, dbDeleted: true })
  })

  it('still deletes Cognito + DB when GitHub revoke reports failure (best-effort)', async () => {
    revokeMock.mockResolvedValue('failed')
    adminDeleteMock.mockResolvedValue(undefined)
    hardDeleteMock.mockResolvedValue(undefined)

    const out = await purgeUser(deps, 'user-1', 'sub-1')

    expect(out.githubUninstall).toBe('failed')
    expect(out.cognitoDeleted).toBe(true)
    expect(out.dbDeleted).toBe(true)
  })
})
