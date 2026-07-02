/**
 * @format
 * Article management server functions for the admin dashboard.
 *
 * All data operations are delegated to the `admin-api` BFF service via
 * authenticated `fetch()` requests. The frontend pod carries no AWS SDK
 * dependencies for this domain.
 *
 * The `requireAdmin()` call acts as a fast-path guard — it rejects
 * non-admin requests at the edge before the network hop to admin-api.
 * The raw JWT is then forwarded as `Authorization: Bearer <token>` so
 * admin-api can re-verify it with Cognito.
 *
 * @see admin-api/src/routes/articles.ts — upstream implementation
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAdmin } from './auth-guard'
import { apiFetch } from './_api-client'

// =============================================================================
// Types
// =============================================================================

/** Response envelope returned by GET /articles and GET /articles/:slug. */
export interface ArticleSummary {
  pk: string
  sk?: string
  title?: string
  excerpt?: string
  status?: string
  author?: string
  date?: string
  publishedAt?: string
  tags?: string[]
  gsi1pk?: string
  updatedAt?: string
}

/** Single pipeline version record from GET /articles/:slug/versions */
export interface ArticleVersion {
  sk: string                    // e.g. "VERSION#v3"
  version: number               // e.g. 3
  status: string                // pipeline status at time of this run
  createdAt: string             // ISO timestamp
  model?: string                // Claude model used
  contentRef?: string           // S3 key for this version's content
  qaTotalScore?: number         // QA evaluation score (0–100)
  qaRecommendation?: 'approve' | 'revise' | 'reject'
  qaIssues?: string[]
  kbPassages?: number           // number of KB passages used
}

/** Metadata returned by GET /articles/:slug on admin-api (PostgreSQL record). */
export interface ArticleMetadata {
  slug: string
  title: string
  excerpt: string | null
  contentMd: string
  tags: string[]
  destinations: string[]
  status: string
  aiGenerated: boolean
  aiModel: string | null
  publishedAt: string | null
  coverImage: string | null
  createdAt: string | null
  updatedAt: string | null
}



// =============================================================================
// Input Schemas
// =============================================================================

const getArticlesSchema = z
  .object({
    status: z
      .enum(['all', 'draft', 'processing', 'review', 'flagged', 'published', 'rejected'])
      .default('all'),
  })
  .default({ status: 'all' })

const slugSchema = z.string().min(1, 'Article slug is required')

const saveContentSchema = z.object({
  id: z.string().min(1, 'Article slug is required'),
  content: z.string(),
})

const saveMetadataSchema = z.object({
  slug: z.string().min(1),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  destinations: z.array(z.enum(['portfolio', 'tucaken'])).optional(),
  status: z.enum(['draft', 'processing', 'review', 'flagged', 'published', 'rejected']).optional(),
  // `null` clears the cover image; a string sets it. admin-api's PUT merges
  // `'coverImage' in updates`, so null is a deliberate remove, not a no-op.
  coverImage: z.string().nullable().optional(),
  publishedAt: z.string().optional(),
  seo: z
    .object({
      metaDescription: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    })
    .optional(),
})

const DESTINATIONS = ['portfolio', 'tucaken'] as const

const createArticleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Invalid slug'),
  title: z.string().min(1),
  excerpt: z.string().optional(),
  contentMd: z.string().min(1),
  tags: z.array(z.string()).optional(),
  destinations: z.array(z.enum(DESTINATIONS)).min(1, 'Pick at least one destination'),
  coverImage: z.string().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
})

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Lists articles, optionally filtered by publication status.
 *
 * @param data.status - `'all'` | `'draft'` | `'review'` | `'published'` | `'rejected'`
 * @returns Array of article summaries from admin-api
 */
export const getArticlesFn = createServerFn({ method: 'GET' })
  .inputValidator(getArticlesSchema)
  .handler(async ({ data }) => {
    await requireAdmin()

    const qs = data.status !== 'all' ? `?status=${encodeURIComponent(data.status)}` : ''
    const body = await apiFetch<{ articles: ArticleSummary[]; count: number }>(
      `/articles${qs}`,
      { pathTemplate: '/articles' },
    )
    return body.articles
  })

/**
 * Retrieves the MDX body for an article from S3 via admin-api's content endpoint.
 *
 * Uses /content/:slug (not /articles/:slug) — the articles endpoint returns
 * DynamoDB METADATA which has no `content` field. Content is stored in S3
 * and served via the dedicated content route.
 *
 * @param data - The article slug
 * @returns { slug, contentRef, content } or null if not found
 */
export const getArticleContentFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()

    try {
      const body = await apiFetch<{ slug: string; contentRef: string; content: string }>(
        `/content/${encodeURIComponent(slug)}`,
        { pathTemplate: '/content/:slug' },
      )
      return body
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('[404]')) {
        return null
      }
      throw err
    }
  })

/**
 * Publishes a draft article by invoking the Bedrock publish Lambda pipeline (async).
 * The Lambda handles MDX processing, AI enrichment, and S3 upload.
 *
 * @param data - The article slug
 * @returns Success indicator with queued status
 */
export const publishArticleFn = createServerFn({ method: 'POST' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()

    const body = await apiFetch<{ queued: boolean; slug: string }>(
      `/articles/${encodeURIComponent(slug)}/publish`,
      { method: 'POST', pathTemplate: '/articles/:slug/publish' },
    )
    return { success: body.queued, slug: body.slug }
  })

/**
 * Unpublishes a published article, reverting it to draft status.
 *
 * @param data - The article slug
 * @returns Success indicator
 */
export const unpublishArticleFn = createServerFn({ method: 'POST' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()

    await apiFetch<{ updated: boolean; slug: string }>(
      `/articles/${encodeURIComponent(slug)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ status: 'draft' }),
        pathTemplate: '/articles/:slug',
      },
    )
    return { success: true }
  })

/**
 * Permanently deletes an article and its content.
 *
 * @param data - The article slug
 * @returns Success indicator
 */
export const deleteArticleFn = createServerFn({ method: 'POST' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()

    await apiFetch<{ deleted: boolean; slug: string }>(
      `/articles/${encodeURIComponent(slug)}`,
      { method: 'DELETE', pathTemplate: '/articles/:slug' },
    )
    return { success: true }
  })

/**
 * Saves article markdown content via admin-api (which writes to S3).
 *
 * Uses POST /content/:slug — content is stored in S3 via admin-api's content
 * route. The articles PUT endpoint handles only metadata fields (title, tags,
 * status, etc.) and does not accept `content`.
 *
 * @param data.id - The article slug
 * @param data.content - Markdown content body
 * @returns Success indicator
 */
export const saveArticleContentFn = createServerFn({ method: 'POST' })
  .inputValidator(saveContentSchema)
  .handler(async ({ data }) => {
    await requireAdmin()

    await apiFetch<{ saved: boolean; slug: string; contentRef: string }>(
      `/content/${encodeURIComponent(data.id)}`,
      {
        method: 'POST',
        body: JSON.stringify({ content: data.content }),
        pathTemplate: '/content/:slug',
      },
    )
    return { success: true }
  })

/**
 * Updates article metadata (title, excerpt, tags, SEO fields, etc.).
 *
 * @param data - Object containing `slug` and any updatable metadata fields
 * @returns Success indicator
 */
export const saveArticleMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator(saveMetadataSchema)
  .handler(async ({ data }) => {
    await requireAdmin()

    const { slug, ...updates } = data

    await apiFetch<{ updated: boolean; slug: string }>(
      `/articles/${encodeURIComponent(slug)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
        pathTemplate: '/articles/:slug',
      },
    )
    return { success: true }
  })

/**
 * Fetches the full pipeline version history for an article slug.
 * Calls GET /articles/:slug/versions on admin-api, which invokes the
 * version-history Lambda to query VERSION#v<n> records from DynamoDB.
 *
 * @param data - The article slug
 * @returns { slug, totalVersions, versions[] }
 */
export const getArticleVersionsFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()

    const body = await apiFetch<{
      success: boolean
      slug: string
      totalVersions: number
      versions: ArticleVersion[]
    }>(
      `/articles/${encodeURIComponent(slug)}/versions`,
      { pathTemplate: '/articles/:slug/versions' },
    )

    return body
  })

/**
 * Fetches article metadata by slug from admin-api (PostgreSQL record).
 *
 * @param data - The article slug
 * @returns ArticleMetadata or null if not found
 */
export const getArticleMetadataFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()
    try {
      const body = await apiFetch<{ article: ArticleMetadata }>(
        `/articles/${encodeURIComponent(slug)}`,
        { pathTemplate: '/articles/:slug' },
      )
      return body.article
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('[404]')) return null
      throw err
    }
  })

/**
 * Creates a new article record in admin-api (POST /articles) and writes
 * the initial markdown content to S3 via the /content/:slug endpoint.
 *
 * Two-step write: metadata first, then S3 content store. Both calls must
 * succeed; a failure on either surfaces to the caller.
 *
 * @param data - Full article payload including slug, title, contentMd, destinations
 * @returns { success, slug } on creation
 */
export const createArticleFn = createServerFn({ method: 'POST' })
  .inputValidator(createArticleSchema)
  .handler(async ({ data }) => {
    await requireAdmin()

    const { contentMd, ...meta } = data
    const created = await apiFetch<{ created: boolean; slug: string }>('/articles', {
      method: 'POST',
      body: JSON.stringify({ ...meta, contentMd }),
      pathTemplate: '/articles',
    })

    if (!created.created) {
      throw new Error('Article creation failed — admin-api returned created:false')
    }

    // Dual content store: also write S3 content/<slug>.md for the admin editor/preview.
    await apiFetch<{ saved: boolean }>(
      `/content/${encodeURIComponent(created.slug)}`,
      {
        method: 'POST',
        body: JSON.stringify({ content: contentMd }),
        pathTemplate: '/content/:slug',
      },
    )

    return { success: true, slug: created.slug }
  })

/**
 * Checks whether a given slug is available (not yet used by another article).
 *
 * Delegates to GET /articles/slug-available?slug=… on admin-api.
 *
 * @param data - The candidate slug string
 * @returns { available: boolean }
 */
export const checkSlugAvailableFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()

    return apiFetch<{ available: boolean }>(
      `/articles/slug-available?slug=${encodeURIComponent(slug)}`,
      { pathTemplate: '/articles/slug-available' },
    )
  })
