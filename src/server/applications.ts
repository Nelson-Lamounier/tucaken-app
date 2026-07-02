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
  ScheduledInterview,
  CoverLetter,
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
 * Lists every scheduled interview (interview_stages.scheduled_at set) for the
 * authenticated user, across applications — the calendar's data source.
 */
export const getScheduledInterviewsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()

  const body = await apiFetch<{ interviews: ScheduledInterview[]; count: number }>(
    '/applications/scheduled-interviews',
    { pathTemplate: '/applications/scheduled-interviews' },
  )
  return body.interviews
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
// Tailored Resumes
// =============================================================================

/** A tailored resume extracted from a completed application analysis */
export interface TailoredResumeSummary {
  readonly slug: string
  readonly targetCompany: string
  readonly targetRole: string
  readonly updatedAt: string
  readonly data: ResumeData
  readonly coverLetter: CoverLetter | null
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
        coverLetter: result.value.application.analysis.coverLetter ?? null,
      })
    }
  })

  return tailored.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
})

// =============================================================================
// Resume Override
// =============================================================================

const updateResumeDataSchema = z.object({
  slug: z.string().min(1),
  resume: z.record(z.unknown()),
})

/**
 * Persists a resume override for an application (upserts the
 * resumes-by-job_application_id row that the detail read returns).
 *
 * @param data.slug - The application slug
 * @param data.resume - The full resume data blob to persist
 * @returns Success indicator
 */
export const updateApplicationResumeFn = createServerFn({ method: 'POST' })
  .inputValidator(updateResumeDataSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    await apiFetch<{ success: boolean }>(
      `/applications/${encodeURIComponent(data.slug)}/resume`,
      {
        method: 'PUT',
        body: JSON.stringify({ resume: data.resume }),
        pathTemplate: '/applications/:slug/resume',
      },
    )
    return { success: true }
  })

// =============================================================================
// Cover Letter Override
// =============================================================================

const coverLetterSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  signoff: z.object({
    name: z.string(),
    email: z.string(),
    linkedin: z.string(),
    github: z.string(),
  }),
})

export const updateCoverLetterSchema = z.object({
  slug: z.string().min(1),
  coverLetter: coverLetterSchema.nullable(),
})

/**
 * Persists a cover-letter override (or clears it with `null`) for an application.
 *
 * @param data.slug - The application slug
 * @param data.coverLetter - Structured cover letter to persist, or `null` to clear
 * @returns Success indicator
 */
export const updateApplicationCoverLetterFn = createServerFn({ method: 'POST' })
  .inputValidator(updateCoverLetterSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    await apiFetch<{ success: boolean }>(
      `/applications/${encodeURIComponent(data.slug)}/cover-letter`,
      {
        method: 'PUT',
        body: JSON.stringify({ coverLetter: data.coverLetter }),
        pathTemplate: '/applications/:slug/cover-letter',
      },
    )
    return { success: true }
  })

// =============================================================================
// Canonical ATS PDF
// =============================================================================

/**
 * Resolves a short-lived presigned URL for the resume's canonical
 * text-selectable PDF (rendered server-side, stored at `resumes.pdf_s3_key`).
 *
 * Returns `null` when no server PDF exists yet (older runs, or a run before the
 * ATS store was wired) so the caller can fall back to client-side rendering,
 * rather than surfacing an error for the expected "not generated yet" case.
 *
 * @param data - The application slug
 * @returns `{ url }` when a canonical PDF exists, otherwise `null`
 */
export const getResumePdfUrlFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ slug: z.string().min(1), filename: z.string().min(1).optional() }))
  .handler(async ({ data }): Promise<{ url: string } | null> => {
    await requireAuth()

    const qs = data.filename ? `?filename=${encodeURIComponent(data.filename)}` : ''
    try {
      const body = await apiFetch<{ url: string; expiresIn: number }>(
        `/applications/${encodeURIComponent(data.slug)}/resume.pdf${qs}`,
        { pathTemplate: '/applications/:slug/resume.pdf' },
      )
      return { url: body.url }
    } catch {
      // 404 (no pdf_s3_key yet) or any transient failure → fall back to the
      // client-side renderer. The download flow never hard-fails on this.
      return null
    }
  })
