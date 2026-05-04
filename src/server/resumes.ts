/**
 * @format
 * Resume management server functions for the admin dashboard — BFF migration.
 *
 * **Migrated Phase 3 (2026-04):** All DynamoDB operations have been removed.
 * Each handler now forwards the authenticated request to the admin-api BFF service,
 * which owns all data access. The `requireAuth()` pre-flight check is retained locally
 * to fail fast at the edge and forward the session token as Bearer auth.
 *
 * @see admin-api/src/routes/resumes.ts — upstream implementation
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

// =============================================================================
// JSON value type (avoids Record<string, unknown> strict-mode incompatibility)
// =============================================================================

/**
 * Represents any JSON-serialisable value.
 * Used for resume `data` to satisfy TypeScript strict `{}` index signature requirements.
 */
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

// =============================================================================
// Input schemas (unchanged from original — validation stays local)
// =============================================================================

const resumeIdSchema = z.string().min(1, 'Resume ID is required')

const createResumeSchema = z.object({
  label: z.string().min(1, 'Resume label is required'),
  data: z.record(z.unknown()),
})

const updateResumeSchema = z.object({
  resumeId: z.string().min(1),
  label: z.string().min(1, 'Resume label is required'),
  data: z.record(z.unknown()),
})

// =============================================================================
// Response shapes from admin-api
// =============================================================================

export interface ResumeSummary {
  resumeId: string
  label: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ResumeWithData extends ResumeSummary {
  data: Record<string, JsonValue>
}

// =============================================================================
// Server Functions — BFF-mediated
// =============================================================================

/**
 * Lists all resume templates.
 *
 * @returns Array of resume summary records
 */
export const getResumesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAuth()
    const response = await apiFetch<{ resumes: ResumeSummary[]; count: number }>(
      '/resumes',
    )
    return response.resumes
  },
)

/**
 * Retrieves a single resume by ID.
 *
 * @param data - The resume ID
 * @returns Full resume record with content data
 */
export const getResumeFn = createServerFn({ method: 'GET' })
  .inputValidator(resumeIdSchema)
  .handler(async ({ data: resumeId }) => {
    await requireAuth()
    const response = await apiFetch<{ resume: ResumeWithData }>(
      `/resumes/${resumeId}`,
      { pathTemplate: '/resumes/:id' },
    )
    return response.resume
  })

/**
 * Creates a new resume template.
 *
 * @param data.label - Human-readable label for the resume
 * @param data.data - Full resume data structure
 * @returns Created resume record
 */
export const createResumeFn = createServerFn({ method: 'POST' })
  .inputValidator(createResumeSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const response = await apiFetch<{ resume: ResumeWithData }>(
      '/resumes',
      {
        method: 'POST',
        body: JSON.stringify({ label: data.label, data: data.data }),
      },
    )
    return response.resume
  })

/**
 * Updates an existing resume template.
 *
 * @param data.resumeId - The resume ID to update
 * @param data.label - Updated label
 * @param data.data - Updated resume data structure
 * @returns Updated resume record
 */
export const updateResumeFn = createServerFn({ method: 'POST' })
  .inputValidator(updateResumeSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const response = await apiFetch<{ resume: ResumeWithData }>(
      `/resumes/${data.resumeId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ label: data.label, data: data.data }),
        pathTemplate: '/resumes/:id',
      },
    )
    return response.resume
  })

/**
 * Permanently deletes a resume template.
 * Guards against deleting the currently active resume (409 from admin-api).
 *
 * @param data - The resume ID
 * @returns Success indicator
 */
export const deleteResumeFn = createServerFn({ method: 'POST' })
  .inputValidator(resumeIdSchema)
  .handler(async ({ data: resumeId }) => {
    await requireAuth()
    await apiFetch<{ deleted: boolean; resumeId: string }>(
      `/resumes/${resumeId}`,
      { method: 'DELETE', pathTemplate: '/resumes/:id' },
    )
    return { success: true }
  })

/**
 * Sets a resume as the active/default template.
 * Deactivates any previously active resume atomically inside admin-api.
 *
 * @param data - The resume ID to activate
 * @returns The newly activated resume record
 */
export const setActiveResumeFn = createServerFn({ method: 'POST' })
  .inputValidator(resumeIdSchema)
  .handler(async ({ data: resumeId }) => {
    await requireAuth()
    const response = await apiFetch<{ resume: ResumeWithData }>(
      `/resumes/${resumeId}/activate`,
      { method: 'POST', pathTemplate: '/resumes/:id/activate' },
    )
    return response.resume
  })

/**
 * Retrieves the currently active resume template.
 *
 * @returns The active resume record or null if none is configured
 */
export const getActiveResumeFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAuth()
    try {
      const response = await apiFetch<{ resume: ResumeWithData }>(
        '/resumes/active',
      )
      return response.resume
    } catch (err: unknown) {
      // 404 = no active resume configured — return null so the UI falls back gracefully
      if (err instanceof Error && err.message.includes('[404]')) {
        return null
      }
      throw err
    }
  },
)
