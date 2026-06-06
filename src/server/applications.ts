/**
 * @format
 * Application management server functions for the admin dashboard.
 *
 * All data operations are delegated to the `admin-api` BFF service via
 * authenticated `fetch()` requests. The frontend pod carries no AWS SDK
 * dependencies for this domain.
 *
 * The `requireAuth()` call acts as a fast-path guard — it rejects
 * unauthenticated requests at the edge before the network hop to admin-api.
 * The raw JWT is then forwarded as `Authorization: Bearer <token>` so
 * admin-api can re-verify it with Cognito.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {
  ApplicationSummary,
  ApplicationStatus,
  ApplicationDetail,
} from '@/lib/types/applications.types'
import type { ResumeData } from '@/lib/resumes/resume-data'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

// =============================================================================
// Input Schemas
// =============================================================================

const getApplicationsSchema = z
  .object({ status: z.string().default('all') })
  .default({ status: 'all' })

const slugSchema = z.string().min(1, 'Application slug is required')

const updateStatusSchema = z.object({
  slug: z.string().min(1),
  status: z.string().min(1),
  interviewStage: z.string().optional(),
})

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Lists applications, optionally filtered by status.
 *
 * @param data.status - A valid application status or `'all'` (default)
 * @returns Array of application summaries sorted by most recently updated
 */
export const getApplicationsFn = createServerFn({ method: 'GET' })
  .inputValidator(getApplicationsSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    const qs = data.status !== 'all' ? `?status=${encodeURIComponent(data.status)}` : ''
    const body = await apiFetch<{ applications: ApplicationSummary[]; count: number }>(
      `/applications${qs}`,
      { pathTemplate: '/applications' },
    )
    return body.applications
  })

/**
 * Retrieves the full detail of a single application by slug.
 *
 * @param data - The application slug
 * @returns Full application detail including analysis and interview data
 */
export const getApplicationDetailFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAuth()

    const body = await apiFetch<{ application: ApplicationDetail }>(
      `/applications/${encodeURIComponent(slug)}`,
      { pathTemplate: '/applications/:slug' },
    )
    return body.application
  })

/**
 * Deletes an application and all its related records (analysis, interview, etc.).
 *
 * @param data - The application slug to delete
 * @returns Success indicator
 */
export const deleteApplicationFn = createServerFn({ method: 'POST' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAuth()

    await apiFetch<{ deleted: boolean; slug: string }>(
      `/applications/${encodeURIComponent(slug)}`,
      { method: 'DELETE', pathTemplate: '/applications/:slug' },
    )
    return { success: true }
  })

/**
 * Replaces the application-level user annotations blob (keyed by insight item id).
 * Persisted on `job_applications.user_annotations`.
 *
 * @param data.slug - The application slug
 * @param data.annotations - The full annotations map to persist
 * @returns Success indicator
 */
export const patchApplicationAnnotationsFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ slug: z.string().min(1), annotations: z.record(z.any()) }))
  .handler(async ({ data }) => {
    await requireAuth()

    await apiFetch<{ success: boolean }>(
      `/applications/${encodeURIComponent(data.slug)}/annotations`,
      {
        method: 'PATCH',
        body: JSON.stringify({ annotations: data.annotations }),
        pathTemplate: '/applications/:slug/annotations',
      },
    )
    return { success: true }
  })

/**
 * Updates the status (and optionally interview stage) of an application.
 *
 * @param data.slug - The application slug
 * @param data.status - The new status
 * @param data.interviewStage - Optional new interview stage
 * @returns Success indicator with the new status
 */
export const updateApplicationStatusFn = createServerFn({ method: 'POST' })
  .inputValidator(updateStatusSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    const body = await apiFetch<{ success: boolean; status: ApplicationStatus }>(
      `/applications/${encodeURIComponent(data.slug)}/status`,
      {
        method: 'POST',
        body: JSON.stringify({
          status: data.status,
          interviewStage: data.interviewStage,
        }),
        pathTemplate: '/applications/:slug/status',
      },
    )
    return { success: body.success, status: body.status }
  })

// =============================================================================
// Execution Status
// =============================================================================

export interface ExecutionStatus {
  readonly sfnStatus: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED' | 'UNKNOWN'
  readonly stageId: string | null
  readonly currentStateName: string | null
  readonly startDate: string | null
  readonly elapsedMs: number | null
}

/**
 * Returns the real-time Step Functions execution stage for an in-flight pipeline.
 * Polls GetExecutionHistory to find which Lambda task is currently running.
 *
 * @param data - The application slug
 * @returns Current SFN status, stageId, and elapsed time
 */
export const getExecutionStatusFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAuth()

    const body = await apiFetch<ExecutionStatus>(
      `/applications/${encodeURIComponent(slug)}/execution`,
      { pathTemplate: '/applications/:slug/execution' },
    )
    return body
  })

// =============================================================================
// Tailored Resumes
// =============================================================================

/** A tailored resume extracted from a completed application analysis */
export interface TailoredResumeSummary {
  readonly slug: string
  readonly targetCompany: string
  readonly targetRole: string
  readonly updatedAt: string
  readonly data: ResumeData
}

/**
 * Fetches all applications and extracts AI-generated tailored resumes.
 *
 * Fetches full application detail in parallel for all apps that have
 * completed analysis (any status past 'analysing'), then filters to those
 * with a populated `analysis.tailoredResume`.
 *
 * @returns Tailored resumes sorted newest-first
 */
export const getTailoredResumesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()

  const { applications } = await apiFetch<{ applications: ApplicationSummary[]; count: number }>(
    '/applications',
  )

  const candidates = applications.filter((a) => a.status !== 'analysing')

  const detailResults = await Promise.allSettled(
    candidates.map((app) =>
      apiFetch<{ application: ApplicationDetail }>(
        `/applications/${encodeURIComponent(app.slug)}`,
        { pathTemplate: '/applications/:slug' },
      ),
    ),
  )

  const tailored: TailoredResumeSummary[] = []
  detailResults.forEach((result, i) => {
    if (
      result.status === 'fulfilled' &&
      result.value.application.analysis?.tailoredResume
    ) {
      tailored.push({
        slug: candidates[i].slug,
        targetCompany: candidates[i].targetCompany,
        targetRole: candidates[i].targetRole,
        updatedAt: candidates[i].updatedAt,
        data: result.value.application.analysis.tailoredResume,
      })
    }
  })

  return tailored.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
})
