/**
 * @format
 * Media upload presign server function for the admin dashboard.
 *
 * The browser sends ONLY metadata (name, type, size) here; admin-api signs an
 * S3 PUT URL and the browser uploads the binary straight to S3. The file body
 * must never cross this server fn: AWS WAF on the ALB rejects large request
 * bodies with 403 before they reach the pod (verified live 2026-07-06), and
 * the S3 bucket already allows CORS PUT from the app origin.
 *
 * Protected by JWT authentication and admin membership via `requireAdmin()`.
 *
 * @see admin-api/src/routes/assets.ts — upstream presign + delete implementation
 * @see src/features/articles/lib/upload-cover-image.ts — the browser-side PUT
 */

import { createServerFn } from '@tanstack/react-start'
import { requireAdmin } from './auth-guard'
import { apiFetch } from './_api-client'
import { z } from 'zod'

// =============================================================================
// Constants
// =============================================================================

const PRODUCTION_DOMAIN = 'https://nelsonlamounier.com'

/** Maximum upload size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set(Object.keys(MIME_TO_EXTENSION))

// =============================================================================
// Helpers
// =============================================================================

/**
 * Maps a MIME type to its file extension.
 *
 * @param mimeType - The MIME type to look up
 * @returns File extension string
 * @throws {TypeError} If the MIME type is not in the allow list
 */
function deriveExtension(mimeType: string): string {
  const ext = MIME_TO_EXTENSION[mimeType]
  if (!ext) {
    throw new TypeError(
      `Unsupported file type: ${mimeType}. Allowed: ${Object.keys(MIME_TO_EXTENSION).join(', ')}`,
    )
  }
  return ext
}

// =============================================================================
// Schemas
// =============================================================================

/** Metadata-only presign request — the file body never crosses this boundary. */
const presignInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive().max(MAX_FILE_SIZE),
  /** Optional deterministic ID for content-addressed storage. */
  id: z.string().min(1).max(120).optional(),
})

// =============================================================================
// Server Function
// =============================================================================

/**
 * Issues a pre-signed S3 PUT URL for a media file (image or video).
 *
 * Flow:
 *   1. Validates the declared type and size (admin-api re-validates upstream)
 *   2. Derives the S3 key (content-addressed when `id` is given)
 *   3. Requests a pre-signed PUT URL from admin-api
 *   4. Returns { url, key, publicUrl } — the caller PUTs the binary to `url`
 *      from the browser and persists `publicUrl`
 */
export const presignMediaUploadFn = createServerFn({ method: 'POST' })
  .inputValidator(presignInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin()

    if (!ALLOWED_MIME_TYPES.has(data.contentType)) {
      throw new Error(
        `Unsupported file type: ${data.contentType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      )
    }

    const ext = deriveExtension(data.contentType)
    const isVideo = data.contentType.startsWith('video/')
    const folder = isVideo ? 'videos/articles' : 'images/articles'

    let s3Key: string
    if (data.id) {
      const safeId = data.id.replaceAll(/[^a-z0-9-]/gi, '-').toLowerCase()
      s3Key = `${folder}/${safeId}.${ext}`
    } else {
      const safeName = data.fileName.replaceAll(/[^a-zA-Z0-9.-]/g, '_')
      s3Key = `${folder}/${Date.now()}-${safeName}`
    }

    const presignResponse = await apiFetch<{
      url: string
      key: string
      expiresIn: number
    }>('/assets/presign', {
      method: 'POST',
      body: JSON.stringify({
        key: s3Key,
        contentType: data.contentType,
        contentLength: data.contentLength,
      }),
    })

    return {
      url: presignResponse.url,
      key: presignResponse.key,
      publicUrl: `${PRODUCTION_DOMAIN}/${presignResponse.key}`,
      expiresIn: presignResponse.expiresIn,
    }
  })
