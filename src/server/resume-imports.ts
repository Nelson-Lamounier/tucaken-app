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
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireAuth } from './auth-guard'

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

function getSessionToken(): string {
  const token = getCookie('__session')
  if (!token) throw new Error('Session cookie missing after auth guard')
  return token
}

async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${ADMIN_API_URL}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { error?: string; upgradeUrl?: string }
      detail = body.error ? ` — ${body.error}` : ''
      // Surface quota errors with a distinct code for the UI to handle
      if (response.status === 429) {
        throw new Error(`QUOTA_EXCEEDED${detail}`)
      }
    } catch (inner) {
      if (inner instanceof Error && inner.message.startsWith('QUOTA_EXCEEDED')) throw inner
    }
    throw new Error(`admin-api ${options.method ?? 'GET'} ${path} failed [${response.status}]${detail}`)
  }
  return response.json() as Promise<T>
}

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
  | 'ready_for_review'
  | 'enriching'
  | 'completed'
  | 'failed'

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
  fileSizeBytes: z.number().int().min(1).max(20 * 1024 * 1024),
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
    const token = getSessionToken()
    const params = new URLSearchParams({
      filename:      data.filename,
      contentType:   data.contentType,
      fileSizeBytes: String(data.fileSizeBytes),
    })
    return apiFetch<UploadUrlResponse>(
      `/api/admin/resume-imports/upload-url?${params.toString()}`,
      token,
    )
  })

/**
 * Signal that the S3 upload completed. Dispatches the K8s Job.
 */
export const completeUploadFn = createServerFn({ method: 'POST' })
  .inputValidator(importIdSchema)
  .handler(async ({ data: importId }) => {
    await requireAuth()
    const token = getSessionToken()
    return apiFetch<{ importId: string; status: string }>(
      `/api/admin/resume-imports/${importId}/complete`,
      token,
      { method: 'POST' },
    )
  })

/**
 * Poll import status. Call until status is 'ready_for_review', 'completed', or 'failed'.
 */
export const getImportStatusFn = createServerFn({ method: 'GET' })
  .inputValidator(importIdSchema)
  .handler(async ({ data: importId }) => {
    await requireAuth()
    const token = getSessionToken()
    const response = await apiFetch<{ import: ResumeImportRecord }>(
      `/api/admin/resume-imports/${importId}`,
      token,
    )
    return response.import
  })

/**
 * List all career entries for the authenticated user.
 * Optional type filter: 'experience' | 'education' | ...
 */
export const listCareerEntriesFn = createServerFn({ method: 'GET' })
  .inputValidator(listEntriesSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const token = getSessionToken()
    const params = data.type ? `?type=${data.type}` : ''
    const response = await apiFetch<{ entries: CareerEntry[] }>(
      `/api/admin/resume-imports/career-entries${params}`,
      token,
    )
    return response.entries
  })

/**
 * List all past resume imports for the authenticated user.
 */
export const listResumeImportsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  const token = getSessionToken()
  const response = await apiFetch<{ imports: ResumeImportRecord[] }>(
    '/api/admin/resume-imports',
    token,
  )
  return response.imports
})
