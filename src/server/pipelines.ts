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
import type { FunnelAnalytics, TriggerResponse } from '@/lib/types/applications.types'

// =============================================================================
// Types
// =============================================================================

type PipelineState = 'pending' | 'processing' | 'review' | 'published' | 'rejected' | 'flagged' | 'failed'

/** JSON-serialisable value — avoids `unknown` in index signatures which breaks TanStack Start's strict serialization check. */
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
type JsonRecord = { [key: string]: JsonValue }

// =============================================================================
// Input Schemas
// =============================================================================

const slugSchema = z.string().min(1, 'Article slug is required')

const pipelineActionSchema = z.object({
  slug: z.string().min(1),
  action: z.enum(['approve', 'reject']),
})

const coachSchema = z.object({
  slug: z.string().min(1),
  interviewStage: z.string().min(1),
  compensationTarget: z.string().optional(),
  region: z.string().optional(),
  force: z.boolean().optional(),
})

const stageFeedbackSchema = z.object({
  slug: z.string().min(1),
  stage: z.string().min(1),
  userCategory: z
    .enum([
      'compensation',
      'skills_mismatch',
      'culture_fit',
      'communication',
      'technical_perf',
      'process_timing',
      'unclear',
      'other',
    ])
    .optional(),
  userNote: z.string().optional(),
  companyFeedback: z.string().optional(),
  companyFeedbackVerbatim: z.boolean().optional(),
  prepSelfRating: z.number().int().min(1).max(5).optional(),
})

const patchStageSchema = z.object({
  slug: z.string().min(1),
  stage: z.string().min(1),
  // z.record(z.unknown()) breaks TanStack Start serialization — use z.any() and narrow at the call site
  userState: z.record(z.any()).optional(),
  scheduleAt: z.string().nullable().optional(),
  markNotApplicable: z.boolean().optional(),
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
 * Triggers the Coach pipeline for a specific interview stage via admin-api.
 *
 * @param data.slug - Application slug
 * @param data.interviewStage - Interview stage to prepare for
 * @param data.compensationTarget - Optional compensation target string
 * @param data.region - Optional region for market context
 * @param data.force - Re-run even if prep already exists
 * @returns Coach trigger response from admin-api
 */
export const triggerCoachFn = createServerFn({ method: 'POST' })
  .inputValidator(coachSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<JsonRecord>(
      `/applications/${encodeURIComponent(data.slug)}/coach`,
      {
        method: 'POST',
        pathTemplate: '/applications/:slug/coach',
        body: JSON.stringify({
          interviewStage: data.interviewStage,
          compensationTarget: data.compensationTarget,
          region: data.region,
          force: data.force,
        }),
      },
    )
  })

/**
 * Patches per-stage user state for an application via admin-api.
 *
 * @param data.slug - Application slug
 * @param data.stage - Stage type to patch (e.g. 'phone-screen')
 * @param data.userState - Arbitrary user annotations for the stage
 * @param data.scheduleAt - ISO 8601 schedule timestamp (null to clear)
 * @param data.markNotApplicable - Mark the stage as not applicable
 * @returns Patch response from admin-api
 */
export const patchStageFn = createServerFn({ method: 'POST' })
  .inputValidator(patchStageSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<JsonRecord>(
      `/applications/${encodeURIComponent(data.slug)}/stages/${encodeURIComponent(data.stage)}`,
      {
        method: 'PATCH',
        pathTemplate: '/applications/:slug/stages/:stage',
        body: JSON.stringify({
          userState: data.userState,
          scheduleAt: data.scheduleAt,
          markNotApplicable: data.markNotApplicable,
        }),
      },
    )
  })

/**
 * Captures opt-in per-stage feedback at a terminal outcome via admin-api.
 *
 * @see PUT /applications/:slug/stages/:stage/feedback — upstream implementation
 * @param data.slug - Application slug
 * @param data.stage - Stage type (e.g. 'phone-screen')
 * @param data.userCategory - User's read on what happened (one of 8 categories)
 * @param data.userNote - Optional freeform note
 * @param data.companyFeedback - Feedback received from the company
 * @param data.companyFeedbackVerbatim - Whether companyFeedback is verbatim from them
 * @param data.prepSelfRating - Optional 1–5 prep self-rating
 */
export const putStageFeedbackFn = createServerFn({ method: 'POST' })
  .inputValidator(stageFeedbackSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<JsonRecord>(
      `/applications/${encodeURIComponent(data.slug)}/stages/${encodeURIComponent(data.stage)}/feedback`,
      {
        method: 'PUT',
        pathTemplate: '/applications/:slug/stages/:stage/feedback',
        body: JSON.stringify({
          userCategory: data.userCategory,
          userNote: data.userNote,
          companyFeedback: data.companyFeedback,
          companyFeedbackVerbatim: data.companyFeedbackVerbatim,
          prepSelfRating: data.prepSelfRating,
        }),
      },
    )
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
 *   jobDescription, targetCompany, targetRole, interviewStage, resumeId, includeCoverLetter
 *
 * @param data.jobDescription - Job description
 * @param data.targetCompany - Target company
 * @param data.targetRole - Target role
 * @param data.interviewStage - Starting interview stage (forwarded to admin-api for stage seeding)
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

/**
 * Re-runs the analysis pipeline for an EXISTING application from its stored
 * job description — no JD re-entry, no duplicate application row.
 *
 * Sends only `{ applicationId }` to admin-api's strategist-job route, which
 * loads company/role/JD from the RLS-scoped job_applications row and
 * dispatches a fresh K8s Job against the SAME application. The new resume
 * version and analysis land on the existing card.
 *
 * @see admin-api/src/routes/pipelines.ts — POST /api/admin/pipelines/strategist-job (reanalysis variant)
 */
export const reanalyseApplicationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<TriggerResponse>(
      '/pipelines/strategist-job',
      {
        method: 'POST',
        body: JSON.stringify({ applicationId: data.applicationId }),
      },
    )
  })

export const triggerApplicationsAnalysisFn = createServerFn({ method: 'POST' })
  .inputValidator(analyseTriggerSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    const body = await apiFetch<TriggerResponse>(
      '/pipelines/strategist-job',
      {
        method: 'POST',
        body: JSON.stringify({
          jobDescription: data.jobDescription,
          targetCompany: data.targetCompany,
          targetRole: data.targetRole,
          ...(data.interviewStage ? { interviewStage: data.interviewStage } : {}),
          ...(data.resumeId ? { resumeId: data.resumeId } : {}),
        }),
      },
    )

    return body
  })

/**
 * Retrieves the 2026-framed application search funnel analytics via admin-api.
 *
 * Every transition rate is returned alongside an honest `context` qualifier;
 * the UI never renders a rate without it. No success score, velocity, or
 * cohort-ranking signal is produced.
 *
 * @see GET /applications/analytics/funnel — upstream implementation
 * @returns The funnel summary, per-transition rates, and reference ranges
 */
export const getFunnelAnalyticsFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    await requireAuth()
    return apiFetch<FunnelAnalytics>('/applications/analytics/funnel', {
      pathTemplate: '/applications/analytics/funnel',
    })
  })

export const getPipelineRunStatusFn = createServerFn({ method: 'GET' })
  .inputValidator(z.string().uuid('Pipeline run ID must be a UUID'))
  .handler(async ({ data: runId }) => {
    await requireAuth()
    const body = await apiFetch<{
      run: {
        id: string
        status: string
        errorMessage: string | null
        updatedAt: string
      }
    }>(
      `/pipelines/runs/${encodeURIComponent(runId)}`,
      { pathTemplate: '/pipelines/runs/:id' },
    )
    return body.run
  })
