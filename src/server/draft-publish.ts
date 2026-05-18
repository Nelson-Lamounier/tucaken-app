/**
 * @format
 * Draft publish server function for the admin dashboard.
 *
 * Two-step flow delegated entirely to the admin-api BFF:
 *   1. POST /api/admin/drafts/:slug       — write drafts/<slug>.md to S3
 *   2. POST /api/admin/pipelines/article-job/:slug — insert pipeline_run,
 *      upsert article placeholder (status=processing), dispatch K8s Job
 *
 * Protected by JWT authentication via `requireAuth()`.
 *
 * @see admin-api/src/routes/drafts.ts    — draft S3 upload endpoint
 * @see admin-api/src/routes/pipelines.ts — K8s Job dispatch endpoint
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

/**
 * Derives a URL-safe slug from a filename.
 *
 * @param fileName - Raw filename (e.g. `my-article.md`)
 * @returns Slugified base without extension
 */
function deriveSlug(fileName: string): string {
  return fileName
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// =============================================================================
// Input Schema
// =============================================================================

const publishDraftSchema = z.object({
  fileName: z.string().min(1, 'Filename is required'),
  content: z.string().min(20, 'Content must be at least 20 characters'),
})

// =============================================================================
// Response Type
// =============================================================================

interface PublishDraftResult {
  readonly success: boolean
  readonly slug: string
  readonly pipelineRunId?: string
  readonly message: string
  readonly error?: string
}

// =============================================================================
// Server Function
// =============================================================================

/**
 * Uploads a markdown draft to S3 and dispatches the article-pipeline K8s Job.
 *
 * Flow:
 *   1. Derives a slug from the filename (local — no network required)
 *   2. Uploads draft: POST /api/admin/drafts/:slug → S3 drafts/<slug>.md
 *   3. Triggers pipeline: POST /api/admin/pipelines/article-job/:slug →
 *      inserts pipeline_run, upserts article placeholder, creates K8s Job
 *
 * @param data.fileName - Draft filename (e.g. `my-article.md`)
 * @param data.content - Raw markdown content
 * @returns Success response with slug and pipelineRunId for tracking
 */
export const publishDraftFn = createServerFn({ method: 'POST' })
  .inputValidator(publishDraftSchema)
  .handler(async ({ data }): Promise<PublishDraftResult> => {
    await requireAuth()

    const slug = deriveSlug(data.fileName)

    if (!slug) {
      return {
        success: false,
        slug: '',
        message: 'Invalid filename — could not derive a valid slug',
      }
    }

    try {
      // Step 1 — upload draft to S3 at drafts/<slug>.md. Awaited for the
      // side effect; the response body is unused.
      await apiFetch<{ uploaded: boolean; slug: string; key: string }>(
        `/drafts/${encodeURIComponent(slug)}`,
        {
          method: 'POST',
          body: JSON.stringify({ content: data.content }),
          pathTemplate: '/drafts/:slug',
        },
      )

      // Step 2 — dispatch the article-pipeline K8s Job. The admin-api derives
      // s3Bucket from its own config and s3SourceKey from the slug convention
      // (drafts/<slug>.md) — no body fields required.
      const trigger = await apiFetch<{ status: string; pipelineRunId: string }>(
        `/pipelines/article-job/${encodeURIComponent(slug)}`,
        {
          method: 'POST',
          body: JSON.stringify({ mode: 'kb-augmented' }),
          pathTemplate: '/pipelines/article-job/:slug',
        },
      )

      return {
        success: true,
        slug,
        pipelineRunId: trigger.pipelineRunId,
        message: `Draft "${slug}" uploaded — pipeline triggered!`,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error'
      return {
        success: false,
        slug,
        message: 'Draft upload or pipeline trigger failed',
        error: message,
      }
    }
  })
