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
 * Retrieves the Markdown body for an article.
 *
 * Reads from `GET /api/admin/articles/:slug`, which returns the full article
 * incl. `contentMd` from the RDS `articles` table. (The legacy `/content/:slug`
 * route was an S3-backed DynamoDB-era endpoint that was never rebuilt for RDS —
 * calling it 404'd, so the editor could neither load nor save content.)
 *
 * @param data - The article slug
 * @returns { slug, content } or null if not found
 */
export const getArticleContentFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()

    try {
      const body = await apiFetch<{ article: { slug: string; contentMd: string } }>(
        `/articles/${encodeURIComponent(slug)}`,
        { pathTemplate: '/articles/:slug' },
      )
      return { slug: body.article.slug, content: body.article.contentMd ?? '' }
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
 * Saves article Markdown content.
 *
 * Writes `contentMd` via `PUT /api/admin/articles/:slug`, which does a partial
 * merge on the RDS `articles` row (all other fields preserved). Replaces the
 * dead `POST /content/:slug` S3 route (never rebuilt for RDS) — that 404 was
 * why editor saves silently failed.
 *
 * @param data.id - The article slug
 * @param data.content - Markdown content body
 * @returns Success indicator
 */
export const saveArticleContentFn = createServerFn({ method: 'POST' })
  .inputValidator(saveContentSchema)
  .handler(async ({ data }) => {
    await requireAdmin()

    await apiFetch<{ article: { slug: string } }>(
      `/articles/${encodeURIComponent(data.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ contentMd: data.content }),
        pathTemplate: '/articles/:slug',
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

// =============================================================================
// Topic candidates (Gap 2)
// =============================================================================

/** A verified measured number carried by a topic candidate (author-confirmed). */
export interface TopicCandidateMetric {
  label: string
  value: string
  unit?: string
  source?: string
}

/** A suggested article topic mined from case-study evidence. */
export interface TopicCandidate {
  id: string
  githubRepoId: string
  repoFullName: string | null
  title: string
  problem: string
  angle: string | null
  primaryKeyword: string | null
  verifiedMetrics: TopicCandidateMetric[]
  skills: string[]
}

const topicCandidatesSchema = z
  .object({ githubRepoId: z.string().regex(/^\d+$/).optional() })
  .default({})

/**
 * Lists the admin's suggested article topics (optionally for one repo).
 * Feeds the builder's "Start from a suggested topic" dropdown.
 */
export const getTopicCandidatesFn = createServerFn({ method: 'GET' })
  .inputValidator(topicCandidatesSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const qs = data.githubRepoId ? `?githubRepoId=${encodeURIComponent(data.githubRepoId)}` : ''
    const body = await apiFetch<{ candidates: TopicCandidate[]; count: number }>(
      `/articles/topic-candidates${qs}`,
      { pathTemplate: '/articles/topic-candidates' },
    )
    return body.candidates
  })

/**
 * Creates a new article record via `POST /api/admin/articles`, which persists
 * the metadata and `contentMd` to the RDS `articles` table in a single write.
 *
 * (Previously this made a second, redundant write to a dead `/content/:slug`
 * S3 route — that 404'd and threw, so article creation surfaced an error even
 * though the row had already been created. `contentMd` is accepted by
 * `POST /articles` directly, so the second call is gone.)
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
