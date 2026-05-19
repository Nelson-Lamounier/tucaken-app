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

vi.mock('../../server/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}))

vi.mock('../../server/_api-client', () => ({
  apiFetch: vi.fn(),
}))

import { getCookie } from '@tanstack/react-start/server'
const mockGetCookie = getCookie as unknown as ReturnType<typeof vi.fn>

import { apiFetch } from '../../server/_api-client'
const apiFetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>

import { setRepoFeaturedFn } from '../../server/github'

describe('setRepoFeaturedFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCookie.mockReturnValue('mock-jwt-token')
    apiFetchMock.mockResolvedValueOnce({ repoFullName: 'o/r', isFeatured: true, featureRank: 1 })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('sends PATCH with pathTemplate for observability', async () => {
    const response = { repoFullName: 'o/r', isFeatured: true, featureRank: 1 }
    apiFetchMock.mockResolvedValueOnce(response)

    const handler = setRepoFeaturedFn as (input: { data: { repoFullName: string; useInResume: boolean } }) => Promise<unknown>
    const result = await handler({ data: { repoFullName: 'o/r', useInResume: true } })

    expect(apiFetchMock).toHaveBeenCalledWith(
      `/github/connected-repos/${encodeURIComponent('o/r')}/featured`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ useInResume: true }),
        pathTemplate: '/github/connected-repos/:repoFullName/featured',
      }),
    )
    expect(result).toEqual(response)
  })
})
