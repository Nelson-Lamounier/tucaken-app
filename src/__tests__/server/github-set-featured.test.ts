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

import { setRepoFeaturedFn } from '../../server/github'

const BASE = 'http://admin-api.admin-api:3002/api/admin'

describe('setRepoFeaturedFn', () => {
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

  it('sends PATCH to the URL-encoded featured endpoint with correct body', async () => {
    const response = { repoFullName: 'o/r', isFeatured: true, featureRank: 1 }
    mockResponse(response)

    const handler = setRepoFeaturedFn as (input: { data: { repoFullName: string; useInResume: boolean } }) => Promise<unknown>
    const result = await handler({ data: { repoFullName: 'o/r', useInResume: true } })

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/github/connected-repos/${encodeURIComponent('o/r')}/featured`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ useInResume: true }),
        headers: expect.objectContaining({ Authorization: 'Bearer mock-jwt-token' }),
      }),
    )
    expect(result).toEqual(response)
  })
})
