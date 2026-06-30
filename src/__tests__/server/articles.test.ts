/**
 * @format
 * Unit tests for article management server functions.
 *
 * Mocks global.fetch and auth-guard to verify:
 * - Proper URL construction for admin-api calls
 * - Status query string filtering
 * - 404 handling and null return
 * - Correct HTTP verbs for publish/unpublish/delete/save
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-start — createServerFn passthrough
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {}
    chain.middleware = () => chain
    chain.inputValidator = () => chain
    chain.handler = (fn: unknown) => fn
    return chain
  },
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-start/server — cookie utilities
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  setResponseHeader: vi.fn(),
}))

import { getCookie } from '@tanstack/react-start/server'
const mockGetCookie = getCookie as unknown as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Mock: auth-guard — always allow unless a test overrides the admin gate
// ---------------------------------------------------------------------------
const mockRequireAdmin = vi.fn()

vi.mock('../../server/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  AuthenticationError: class AuthenticationError extends Error {
    code = 'UNAUTHENTICATED' as const
    constructor(message = 'Authentication required') {
      super(message)
      this.name = 'AuthenticationError'
    }
  },
}))

// ---------------------------------------------------------------------------
// Mock: global.fetch
// ---------------------------------------------------------------------------
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ---------------------------------------------------------------------------
// Import SUT
// ---------------------------------------------------------------------------
import {
  getArticlesFn,
  getArticleContentFn,
  publishArticleFn,
  unpublishArticleFn,
  deleteArticleFn,
  saveArticleContentFn,
  saveArticleMetadataFn,
  createArticleFn,
  checkSlugAvailableFn,
} from '../../server/articles'

const EXPECTED_API_URL = 'http://admin-api.admin-api:3002/api/admin'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(data: unknown, ok = true, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
  })
}

const DRAFT_ARTICLE = {
  pk: 'ARTICLE#my-draft',
  title: 'Draft Article',
  status: 'draft',
  updatedAt: '2026-01-11T10:00:00Z',
}

const ARTICLE_DETAIL = {
  slug: 'my-draft',
  title: 'Draft Article',
  description: 'Test',
  status: 'draft',
  author: 'Test Author',
  date: '2026-01-10',
  contentRef: 's3://bucket/key.mdx',
  content: '# My Draft Article\n\nThis is the content.',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('articles server functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCookie.mockReturnValue('mock-jwt-token')
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getArticlesFn', () => {
    it('requires admin membership before listing article management data', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Admin access required'))

      const handler = getArticlesFn as (i: { data: { status: string } }) => Promise<unknown[]>

      await expect(handler({ data: { status: 'all' } }))
        .rejects
        .toThrow(/Admin access required/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should list all articles without a status filter', async () => {
      mockResponse({ articles: [DRAFT_ARTICLE], count: 1 })

      const handler = getArticlesFn as (i: { data: { status: string } }) => Promise<unknown[]>
      const result = await handler({ data: { status: 'all' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-jwt-token' }),
        }),
      )
      expect(result).toEqual([DRAFT_ARTICLE])
    })

    it('should append status to the query string when not "all"', async () => {
      mockResponse({ articles: [DRAFT_ARTICLE], count: 1 })

      const handler = getArticlesFn as (i: { data: { status: string } }) => Promise<unknown[]>
      await handler({ data: { status: 'draft' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles?status=draft`,
        expect.anything(),
      )
    })
  })

  describe('getArticleContentFn', () => {
    it('should fetch article content from admin-api', async () => {
      mockResponse(ARTICLE_DETAIL)

      const handler = getArticleContentFn as (i: { data: string }) => Promise<unknown>
      const result = await handler({ data: 'my-draft' })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/content/my-draft`,
        expect.anything(),
      )
      expect(result).toEqual(ARTICLE_DETAIL)
    })

    it('should return null when article is not found (404)', async () => {
      mockResponse({ error: 'Article not found' }, false, 404)

      const handler = getArticleContentFn as (i: { data: string }) => Promise<unknown>
      const result = await handler({ data: 'nonexistent' })

      expect(result).toBeNull()
    })
  })

  describe('publishArticleFn', () => {
    it('requires admin membership before publishing an article', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Admin access required'))

      const handler = publishArticleFn as (i: { data: string }) => Promise<{ success: boolean }>

      await expect(handler({ data: 'my-draft' }))
        .rejects
        .toThrow(/Admin access required/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should call POST /:slug/publish and return success', async () => {
      mockResponse({ queued: true, slug: 'my-draft' })

      const handler = publishArticleFn as (i: { data: string }) => Promise<{ success: boolean }>
      const result = await handler({ data: 'my-draft' })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles/my-draft/publish`,
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('unpublishArticleFn', () => {
    it('should call PUT /:slug with status draft', async () => {
      mockResponse({ updated: true, slug: 'my-published' })

      const handler = unpublishArticleFn as (i: { data: string }) => Promise<{ success: boolean }>
      const result = await handler({ data: 'my-published' })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles/my-published`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'draft' }),
        }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('deleteArticleFn', () => {
    it('should call DELETE /:slug and return success', async () => {
      mockResponse({ deleted: true, slug: 'my-draft' })

      const handler = deleteArticleFn as (i: { data: string }) => Promise<{ success: boolean }>
      const result = await handler({ data: 'my-draft' })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles/my-draft`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer mock-jwt-token' }),
        }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('saveArticleContentFn', () => {
    it('should call POST /content/:slug with content body', async () => {
      mockResponse({ updated: true, slug: 'my-draft' })

      const handler = saveArticleContentFn as (
        i: { data: { id: string; content: string } },
      ) => Promise<{ success: boolean }>
      const result = await handler({ data: { id: 'my-draft', content: '# Updated content' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/content/my-draft`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: '# Updated content' }),
        }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('saveArticleMetadataFn', () => {
    it('should call PUT /:slug with metadata fields', async () => {
      mockResponse({ updated: true, slug: 'my-draft' })

      const handler = saveArticleMetadataFn as (
        i: { data: { slug: string; title?: string } },
      ) => Promise<{ success: boolean }>
      const result = await handler({ data: { slug: 'my-draft', title: 'New Title' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles/my-draft`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ title: 'New Title' }),
        }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('createArticleFn', () => {
    it('posts to /articles then writes content to /content/:slug', async () => {
      mockResponse({ created: true, slug: 'hello-world' })
      mockResponse({ saved: true, slug: 'hello-world', contentRef: 's3://bucket/key.md' })

      const handler = createArticleFn as (i: {
        data: {
          slug: string
          title: string
          contentMd: string
          destinations: string[]
          status?: string
        }
      }) => Promise<{ success: boolean; slug: string }>

      const result = await handler({
        data: {
          slug: 'hello-world',
          title: 'Hello World',
          contentMd: '# Hello World',
          destinations: ['portfolio'],
        },
      })

      expect(result).toEqual({ success: true, slug: 'hello-world' })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        `${EXPECTED_API_URL}/articles`,
        expect.objectContaining({ method: 'POST' }),
      )
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        `${EXPECTED_API_URL}/content/hello-world`,
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('propagates a 409 duplicate-slug error from admin-api', async () => {
      mockResponse({ error: 'Slug already exists' }, false, 409)

      const handler = createArticleFn as (i: {
        data: {
          slug: string
          title: string
          contentMd: string
          destinations: string[]
        }
      }) => Promise<{ success: boolean; slug: string }>

      await expect(
        handler({
          data: {
            slug: 'existing-slug',
            title: 'Existing',
            contentMd: '# Existing',
            destinations: ['tucaken'],
          },
        }),
      ).rejects.toThrow()
    })

    it('throws and does NOT call S3 content endpoint when admin-api returns created:false', async () => {
      mockResponse({ created: false, slug: 'hello-world' })

      const handler = createArticleFn as (i: {
        data: {
          slug: string
          title: string
          contentMd: string
          destinations: string[]
          status?: string
        }
      }) => Promise<{ success: boolean; slug: string }>

      await expect(
        handler({
          data: {
            slug: 'hello-world',
            title: 'Hello World',
            contentMd: '# Hello World',
            destinations: ['portfolio'],
          },
        }),
      ).rejects.toThrow('created:false')

      // Only the metadata POST should have been called — NOT the S3 content write
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles`,
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('checkSlugAvailableFn', () => {
    it('returns { available: false } when admin-api reports slug taken', async () => {
      mockResponse({ available: false })

      const handler = checkSlugAvailableFn as (
        i: { data: string },
      ) => Promise<{ available: boolean }>

      const result = await handler({ data: 'taken-slug' })

      expect(result).toEqual({ available: false })
      expect(fetchMock).toHaveBeenCalledWith(
        `${EXPECTED_API_URL}/articles/slug-available?slug=taken-slug`,
        expect.anything(),
      )
    })

    it('returns { available: true } when admin-api reports slug free', async () => {
      mockResponse({ available: true })

      const handler = checkSlugAvailableFn as (
        i: { data: string },
      ) => Promise<{ available: boolean }>

      const result = await handler({ data: 'free-slug' })

      expect(result).toEqual({ available: true })
    })
  })
})
