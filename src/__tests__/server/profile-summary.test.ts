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

import { getProfileSummaryFn } from '../../server/profile'

const BASE = 'http://admin-api.admin-api:3002/api/admin'

describe('profile server functions', () => {
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

  describe('getProfileSummaryFn', () => {
    it('issues GET to /profile/summary and returns parsed JSON', async () => {
      const summary = {
        rollup: { total: 5 },
        mirror: { paragraph: 'You are a builder.' },
        reveal: { reveals: [{ insight: 'Systems thinker', evidence: 'K8s pipelines' }] },
        direction: null,
        reconciliation: null,
        diagnostic: null,
        refreshedAt: '2026-05-18T00:00:00Z',
        synthesisRefreshedAt: '2026-05-18T01:00:00Z',
      }
      mockResponse(summary)

      const handler = getProfileSummaryFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/profile/summary`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-jwt-token' }),
        }),
      )
      expect(result).toEqual(summary)
    })

    it('passes a populated reconciliation through unchanged', async () => {
      const summary = {
        rollup: { total: 5 },
        mirror: { paragraph: 'You are a builder.' },
        reveal: { reveals: [{ insight: 'Systems thinker', evidence: 'K8s pipelines' }] },
        direction: null,
        reconciliation: {
          unsupportedClaims: [{ claim: 'A claim text here', resumeRef: 'Acme', whyUnsupported: 'no domain evidence' }],
          undersold: [{ evidence: 'TS depth across repos', rollupDimension: 'language share', suggestion: 'add a TS bullet here' }],
        },
        diagnostic: null,
        refreshedAt: '2026-05-18T00:00:00Z',
        synthesisRefreshedAt: '2026-05-18T01:00:00Z',
      }
      mockResponse(summary)

      const handler = getProfileSummaryFn as () => Promise<unknown>
      const result = await handler() as typeof summary

      expect(result.reconciliation?.unsupportedClaims[0]?.claim).toBe('A claim text here')
      expect(result.reconciliation?.undersold[0]?.rollupDimension).toBe('language share')
    })

    it('passes a populated diagnostic through unchanged', async () => {
      const summary = {
        rollup: { total: 5 },
        mirror: { paragraph: 'You are a builder.' },
        reveal: { reveals: [{ insight: 'Systems thinker', evidence: 'K8s pipelines' }] },
        direction: null,
        reconciliation: null,
        diagnostic: {
          overall: 78,
          components: {
            profileDepth:            { score: 86, blockers: [] },
            ragDepth:                { score: 70, blockers: ['No project repos with high KB quality'] },
            directionConfidence:     { score: 80, blockers: [] },
            reconciliationAlignment: { score: 80, blockers: [] },
            resumeCoverage:          { score: 75, blockers: [] },
          },
          methodology: { version: 1, weights: { profileDepth: 20, ragDepth: 20, directionConfidence: 20, reconciliationAlignment: 20, resumeCoverage: 20 }, notes: 'Equal-weight v1' },
          explanation: 'You score 78 because…',
        },
        refreshedAt: '2026-05-18T00:00:00Z',
        synthesisRefreshedAt: '2026-05-18T01:00:00Z',
      }
      mockResponse(summary)

      const handler = getProfileSummaryFn as () => Promise<unknown>
      const result = await handler() as typeof summary

      expect(result.diagnostic?.overall).toBe(78)
      expect(result.diagnostic?.components.ragDepth.blockers[0]).toBe('No project repos with high KB quality')
    })
  })
})
