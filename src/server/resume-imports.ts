/**
 * @format
 * Resume import server functions — BFF bridge to admin-api.
 *
 * Upload flow:
 *   1. getUploadUrlFn   — presigned S3 PUT URL + creates import record
 *   2. [browser]        — PUT file bytes directly to S3 via presigned URL
 *   3. completeUploadFn — signals upload done, dispatches K8s Job
 *   4. getImportStatusFn (polled) — polls until 'ready_for_review'
 *   5. listCareerEntriesFn — fetches extracted career entries
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

// ─── JSON value type (same pattern as resumes.ts) ────────────────────────────
// TanStack Start's ValidateSerializableMapped rejects `unknown` index values.
// JSONB from Postgres is always JSON-safe, so we use explicit recursive types.
type JsonPrimitive = string | number | boolean | null
type JsonValue     = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

// ─── Response shapes ──────────────────────────────────────────────────────────

export type ImportStatus =
  | 'awaiting_upload'
  | 'queued'
  | 'parsing'
  | 'extracting_career'
  | 'analyzing'
  | 'ready_for_review'
  | 'confirmed'
  | 'enriching'
  | 'completed'
  | 'failed'

export type ImportPhase =
  | 'uploading' | 'parsing' | 'extracting' | 'analyzing'
  | 'review' | 'enriching' | 'done' | 'error'

/** Server-driven progress contract. The client honours retryAfterMs and
 *  stops on terminal — no client-side timeout guesswork. */
export interface ImportProgress {
  v:              1
  status:         ImportStatus
  phase:          ImportPhase
  step:           number
  totalSteps:     number
  terminal:       boolean
  error:          { code: string; message: string } | null
  gapReportReady: boolean
  heartbeatAt:    string
  retryAfterMs:   number
}

export interface PerRoleGap {
  roleId:                      string
  company:                     string
  title:                       string
  period:                      string
  completenessScore:           number
  coveredResponsibilities:     string[]
  missingResponsibilities:     string[]
  suggestedAdditions:          Array<{ bullet: string; rationale: string }>
  quantificationOpportunities: string[]
  keywordsForATS:              string[]
  externalValidation:          'full' | 'limited'
}

export interface GapAnalysisReport {
  overallScore:      number
  perRole:           PerRoleGap[]
  skillsGap:         { present: string[]; missing: string[]; emerging: string[] }
  narrativeFeedback: string
  freeTierLimit:     { rolesSkipped: number; upgradeCta: string | null }
}

export interface UploadUrlResponse {
  importId:  string
  uploadUrl: string
  s3Key:     string
  expiresIn: number
}

export interface ResumeImportRecord {
  id:                    string
  status:                ImportStatus
  statusMessage:         string | null
  currentStep:           string | null
  totalSteps:            number | null
  careerEntriesCreated:  string[]
  embeddingsCreatedCount: number
  errorCode:             string | null
  originalFilename:      string
  createdAt:             string
}

export type CareerEntryType =
  | 'experience'
  | 'education'
  | 'skill'
  | 'certification'
  | 'project'
  | 'achievement'

export interface CareerEntry {
  id:               string
  entryType:        CareerEntryType
  rawData:          { [key: string]: JsonValue }
  enrichedData:     { [key: string]: JsonValue } | null
  enrichmentStatus: string
  displayOrder:     number
  createdAt:        string
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const uploadUrlSchema = z.object({
  filename:      z.string().min(1),
  contentType:   z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  fileSizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
})

const importIdSchema = z.string().uuid()

const listEntriesSchema = z.object({
  type: z.enum(['experience', 'education', 'skill', 'certification', 'project', 'achievement']).optional(),
})

// ─── Server functions ─────────────────────────────────────────────────────────

/**
 * Request a presigned S3 PUT URL and create the import record.
 * Returns the importId needed for subsequent calls.
 */
export const getUploadUrlFn = createServerFn({ method: 'GET' })
  .inputValidator(uploadUrlSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const params = new URLSearchParams({
      filename:      data.filename,
      contentType:   data.contentType,
      fileSizeBytes: String(data.fileSizeBytes),
    })
    return apiFetch<UploadUrlResponse>(
      `/resume-imports/upload-url?${params.toString()}`,
      { pathTemplate: '/resume-imports/upload-url' },
    )
  })

/**
 * Signal that the S3 upload completed. Dispatches the K8s Job.
 */
export const completeUploadFn = createServerFn({ method: 'POST' })
  .inputValidator(importIdSchema)
  .handler(async ({ data: importId }) => {
    await requireAuth()
    return apiFetch<{ importId: string; status: string }>(
      `/resume-imports/${importId}/complete`,
      { method: 'POST', pathTemplate: '/resume-imports/:id/complete' },
    )
  })

/**
 * Retry a failed import job. Re-dispatches the K8s Job for an existing import record.
 */
export const retryImportFn = createServerFn({ method: 'POST' })
  .inputValidator(importIdSchema)
  .handler(async ({ data: importId }) => {
    await requireAuth()
    return apiFetch<{ importId: string; status: string }>(
      `/resume-imports/${importId}/retry`,
      { method: 'POST', pathTemplate: '/resume-imports/:id/retry' },
    )
  })

/**
 * Poll import status. Call until status is 'ready_for_review', 'completed', or 'failed'.
 */
export const getImportStatusFn = createServerFn({ method: 'GET' })
  .inputValidator(importIdSchema)
  .handler(async ({ data: importId }) => {
    await requireAuth()
    const response = await apiFetch<{ import: ResumeImportRecord }>(
      `/resume-imports/${importId}`,
      { pathTemplate: '/resume-imports/:id' },
    )
    return response.import
  })

/**
 * Server-driven progress. Poll on the cadence the server returns
 * (progress.retryAfterMs); stop when progress.terminal is true.
 */
export const getImportProgressFn = createServerFn({ method: 'GET' })
  .inputValidator(importIdSchema)
  .handler(async ({ data: importId }) => {
    await requireAuth()
    const response = await apiFetch<{ progress: ImportProgress }>(
      `/resume-imports/${importId}/progress`,
      { pathTemplate: '/resume-imports/:id/progress' },
    )
    return response.progress
  })

/**
 * Fetch the gap-analysis report once — call only when
 * progress.gapReportReady is true. Returns null if no report exists.
 */
export const getGapReportFn = createServerFn({ method: 'GET' })
  .inputValidator(importIdSchema)
  .handler(async ({ data: importId }) => {
    await requireAuth()
    const response = await apiFetch<{ gapReport: GapAnalysisReport | null }>(
      `/resume-imports/${importId}/gap-report`,
      { pathTemplate: '/resume-imports/:id/gap-report' },
    )
    return response.gapReport
  })

/**
 * List all career entries for the authenticated user.
 * Optional type filter: 'experience' | 'education' | ...
 */
export const listCareerEntriesFn = createServerFn({ method: 'GET' })
  .inputValidator(listEntriesSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const params = data.type ? `?type=${data.type}` : ''
    const response = await apiFetch<{ entries: CareerEntry[] }>(
      `/resume-imports/career-entries${params}`,
      { pathTemplate: '/resume-imports/career-entries' },
    )
    return response.entries
  })

export const updateCareerEntryFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id:      z.string().uuid(),
      rawData: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ entry: CareerEntry }>(
      `/resume-imports/career-entries/${data.id}`,
      {
        method:       'PUT',
        body:         JSON.stringify({ rawData: data.rawData }),
        pathTemplate: '/resume-imports/career-entries/:id',
      },
    )
  })

export const deleteCareerEntryFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ deleted: boolean }>(
      `/resume-imports/career-entries/${data.id}`,
      {
        method:       'DELETE',
        pathTemplate: '/resume-imports/career-entries/:id',
      },
    )
  })

/**
 * List all past resume imports for the authenticated user.
 */
export const listResumeImportsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  const response = await apiFetch<{ imports: ResumeImportRecord[] }>(
    '/resume-imports',
  )
  return response.imports
})
