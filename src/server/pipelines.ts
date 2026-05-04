/**
 * @format
 * Pipeline action server functions for the admin dashboard.
 *
 * All data operations are delegated to the `admin-api` BFF service via
 * authenticated `fetch()` requests. The frontend pod carries no AWS SDK
 * dependencies (S3, DynamoDB, Lambda) for this domain.
 *
 * The `requireAuth()` call acts as a fast-path guard — it rejects
 * unauthenticated requests at the edge before the network hop to admin-api.
 * The raw JWT is forwarded as `Authorization: Bearer <token>` so admin-api
 * can re-verify it with Cognito.
 *
 * @see admin-api/src/routes/pipelines.ts — upstream implementation
 * @see admin-api/src/routes/articles.ts  — publish route (POST /:slug/publish)
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'
import type { TriggerResponse } from '@/lib/types/applications.types'

// =============================================================================
// Types
// =============================================================================

type PipelineState = 'pending' | 'processing' | 'review' | 'published' | 'rejected' | 'flagged' | 'failed'

// =============================================================================
// Input Schemas
// =============================================================================

const slugSchema = z.string().min(1, 'Article slug is required')

const pipelineActionSchema = z.object({
  slug: z.string().min(1),
  action: z.enum(['approve', 'reject']),
})

const strategistCoachSchema = z.object({
  slug: z.string().min(1),
  coachingType: z.enum(['GENERAL', 'TECHNICAL', 'BEHAVIOURAL', 'CULTURAL']),
  targetCompany: z.string().min(1),
  targetRole: z.string().min(1),
  resumeId: z.string().optional(),
})

const analyseTriggerSchema = z.object({
  jobDescription: z.string(),
  targetCompany: z.string(),
  targetRole: z.string(),
  interviewStage: z
    .enum([
      'applied',
      'phone-screen',
      'technical',
      'system-design',
      'behavioural',
      'bar-raiser',
      'final',
    ])
    .optional(),
  resumeId: z.string().optional(),
  includeCoverLetter: z.boolean().optional(),
})

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Retrieves the current pipeline status for an article.
 *
 * Delegates to `GET /api/admin/articles/:slug` on admin-api, which returns
 * the DynamoDB metadata record including the `status` field used to derive
 * pipeline state.
 *
 * @param data - The article slug
 * @returns Pipeline state and metadata
 */
export const getPipelineStatusFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAuth()

    try {
      const body = await apiFetch<{
        article: {
          status?: string
          title?: string
          updatedAt?: string
        }
      }>(
        `/articles/${encodeURIComponent(slug)}`,
        { pathTemplate: '/articles/:slug' },
      )

      const article = body.article
      const dynamoStatus = article.status

      // Derive pipeline state from article status
      const pipelineState = ((): PipelineState => {
        if (dynamoStatus === 'published') return 'published'
        if (dynamoStatus === 'rejected') return 'rejected'
        if (dynamoStatus === 'flagged') return 'flagged'
        if (dynamoStatus === 'review') return 'review'
        if (dynamoStatus === 'processing') return 'processing'
        if (dynamoStatus === 'draft') return 'pending'
        if (!dynamoStatus) return 'pending'
        return 'failed'
      })()

      return {
        slug,
        pipelineState,
        s3ReviewExists: pipelineState === 'review',
        dynamoMetadata: true,
        title: article.title,
        updatedAt: article.updatedAt,
        statusRaw: dynamoStatus,
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('[404]')) {
        // Article not yet in DynamoDB — pipeline just started, keep polling
        return {
          slug,
          pipelineState: 'pending' as PipelineState,
          s3ReviewExists: false,
          dynamoMetadata: false,
        }
      }
      // Infrastructure / auth / network error — state unknown, keep polling
      // Only DynamoDB returning an unrecognised status string maps to 'failed'
      return {
        slug,
        pipelineState: 'processing' as PipelineState,
        s3ReviewExists: false,
        dynamoMetadata: false,
      }
    }
  })

/**
 * Triggers the publish/reject Lambda for an article via admin-api.
 *
 * Routes to `POST /api/admin/articles/:slug/publish` (approve) or
 * `PUT /api/admin/articles/:slug` with `{ status: 'rejected' }` (reject).
 *
 * @param data.slug - The article slug
 * @param data.action - `'approve'` or `'reject'`
 * @returns Success indicator with slug and action
 */
export const triggerPipelineActionFn = createServerFn({ method: 'POST' })
  .inputValidator(pipelineActionSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    if (data.action === 'approve') {
      await apiFetch<{ queued: boolean; slug: string }>(
        `/articles/${encodeURIComponent(data.slug)}/publish`,
        { method: 'POST', pathTemplate: '/articles/:slug/publish' },
      )
    } else {
      await apiFetch<{ updated: boolean; slug: string }>(
        `/articles/${encodeURIComponent(data.slug)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ status: 'rejected' }),
          pathTemplate: '/articles/:slug',
        },
      )
    }

    return {
      success: true,
      slug: data.slug,
      action: data.action,
    }
  })

/**
 * Triggers the strategist coaching Lambda for interview preparation via admin-api.
 *
 * @param data.slug - Application slug
 * @param data.coachingType - Type of coaching session
 * @param data.targetCompany - Target company name
 * @param data.targetRole - Target role title
 * @param data.resumeId - Optional resume ID to include
 * @returns Parsed Lambda response body from admin-api
 */
export const triggerStrategistCoachFn = createServerFn({ method: 'POST' })
  .inputValidator(strategistCoachSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    const body = await apiFetch<Record<string, object>>(
      '/pipelines/strategist-job',
      {
        method: 'POST',
        body: JSON.stringify({
          pipelineId: `COACH-${Date.now()}`,
          slug: data.slug,
          context: {
            coachingType: data.coachingType,
            targetCompany: data.targetCompany,
            targetRole: data.targetRole,
            resumeId: data.resumeId,
          },
        }),
      },
    )

    return body
  })

/**
 * Triggers a new applications analysis pipeline (Research → Applications) via admin-api.
 *
 * The Strategist trigger Lambda uses a Zod `.strict()` discriminated union on
 * `operation`. Only the fields it expects must be sent — extra fields (e.g.
 * `interviewStage`) cause silent validation failures because the invocation is
 * asynchronous on the admin-api side.
 *
 * Sent to Lambda (analyse operation):
 *   operation, jobDescription, targetCompany, targetRole, resumeId, includeCoverLetter
 *
 * NOT sent (unsupported by AnalyseRequestSchema):
 *   interviewStage — hardcoded to 'applied' inside the Lambda for analyse runs
 *
 * @param data.jobDescription - Job description
 * @param data.targetCompany - Target company
 * @param data.targetRole - Target role
 * @param data.interviewStage - Stored locally; NOT forwarded to the Lambda
 * @param data.resumeId - Resume ID (optional — empty string triggers build-from-scratch mode)
 * @param data.includeCoverLetter - Whether to generate cover letter
 * @returns Trigger response with pipelineId and applicationSlug
 */
/**
 * Requeues a failed application analysis via the SQS Dead Letter Queue.
 * The admin-api reads the original execution input from the DLQ and
 * re-submits it to the Step Functions state machine.
 *
 * @see admin-api/src/routes/applications.ts — POST /api/admin/applications/:slug/requeue
 */
export const requeueApplicationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ success: boolean; message: string }>(
      `/applications/${encodeURIComponent(data.slug)}/requeue`,
      { method: 'POST', pathTemplate: '/applications/:slug/requeue' },
    )
  })

export const triggerApplicationsAnalysisFn = createServerFn({ method: 'POST' })
  .inputValidator(analyseTriggerSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    // Build the exact payload the Lambda's AnalyseRequestSchema expects.
    // The schema uses .strict() so only these fields are allowed.
    const lambdaPayload: Record<string, unknown> = {
      operation: 'analyse',
      jobDescription: data.jobDescription,
      targetCompany: data.targetCompany,
      targetRole: data.targetRole,
      resumeId: data.resumeId ?? '',
      includeCoverLetter: data.includeCoverLetter ?? true,
    }

    const body = await apiFetch<TriggerResponse>(
      '/pipelines/strategist-job',
      {
        method: 'POST',
        body: JSON.stringify(lambdaPayload),
      },
    )

    return body
  })
