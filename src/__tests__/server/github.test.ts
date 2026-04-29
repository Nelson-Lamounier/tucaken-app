import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {}
    chain.middleware = () => chain
    chain.inputValidator = () => chain
    chain.handler = (fn: unknown) => fn
    return chain
  },
}))

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  setResponseHeader: vi.fn(),
}))

import { getCookie } from '@tanstack/react-start/server'
const mockGetCookie = getCookie as unknown as ReturnType<typeof vi.fn>

vi.mock('../../server/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import {
  getGitHubInstallationFn,
  handleGitHubInstallFn,
  disconnectGitHubFn,
  getGitHubAccessibleReposFn,
  getGitHubConnectedReposFn,
  triggerGitHubIngestionFn,
  removeConnectedRepoFn,
} from '../../server/github'

const BASE = 'http://admin-api.admin-api:3002/api/admin'

describe('github server functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCookie.mockReturnValue('mock-jwt-token')
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const mockResponse = (data: unknown, ok = true, status = 200, statusText = ok ? 'OK' : 'Error') => {
    fetchMock.mockResolvedValueOnce({
      ok,
      status,
      statusText,
      json: async () => data,
      text: async () => JSON.stringify(data),
    })
  }

  describe('getGitHubInstallationFn', () => {
    it('returns installation when found', async () => {
      const installation = { installationId: '123', accountLogin: 'nelsonlamounier' }
      mockResponse({ installation })

      const handler = getGitHubInstallationFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/installation`,
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-jwt-token' }) }),
      )
      expect(result).toEqual(installation)
    })

    it('returns null on 404', async () => {
      mockResponse({ message: 'Not found' }, false, 404)

      const handler = getGitHubInstallationFn as () => Promise<unknown>
      const result = await handler()

      expect(result).toBeNull()
    })
  })

  describe('handleGitHubInstallFn', () => {
    it('posts installationId to admin-api', async () => {
      mockResponse({ success: true })

      const handler = handleGitHubInstallFn as (input: { data: { installationId: string } }) => Promise<unknown>
      const result = await handler({ data: { installationId: '42' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/installation`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ installationId: '42' }),
        }),
      )
      expect(result).toEqual({ success: true })
    })
  })

  describe('disconnectGitHubFn', () => {
    it('sends DELETE to installation endpoint', async () => {
      mockResponse({ success: true })

      const handler = disconnectGitHubFn as () => Promise<unknown>
      await handler()

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/installation`,
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  describe('getGitHubAccessibleReposFn', () => {
    it('returns repos array', async () => {
      const repos = [{ id: 1, fullName: 'owner/repo' }]
      mockResponse({ repos })

      const handler = getGitHubAccessibleReposFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/github/repos`, expect.anything())
      expect(result).toEqual(repos)
    })
  })

  describe('getGitHubConnectedReposFn', () => {
    it('returns connected repos array', async () => {
      const repos = [{ repoFullName: 'owner/repo', syncStatus: 'complete' }]
      mockResponse({ repos })

      const handler = getGitHubConnectedReposFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/github/connected-repos`, expect.anything())
      expect(result).toEqual(repos)
    })
  })

  describe('triggerGitHubIngestionFn', () => {
    it('posts repoFullName to ingestion trigger', async () => {
      const response = { status: 'dispatched', pipelineRunId: 'run-1', jobName: 'job-1' }
      mockResponse(response)

      const handler = triggerGitHubIngestionFn as (input: { data: { repoFullName: string; forceReindex?: boolean } }) => Promise<unknown>
      const result = await handler({ data: { repoFullName: 'owner/repo', forceReindex: true } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/ingestion/trigger`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ repoFullName: 'owner/repo', forceReindex: true }),
        }),
      )
      expect(result).toEqual(response)
    })
  })

  describe('removeConnectedRepoFn', () => {
    it('sends DELETE with encoded repo name in URL', async () => {
      mockResponse({ success: true })

      const handler = removeConnectedRepoFn as (input: { data: { repoFullName: string } }) => Promise<unknown>
      await handler({ data: { repoFullName: 'owner/repo' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/connected-repos/${encodeURIComponent('owner/repo')}`,
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ repoFullName: 'owner/repo' }),
        }),
      )
    })
  })
})
