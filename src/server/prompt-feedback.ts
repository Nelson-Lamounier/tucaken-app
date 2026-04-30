/**
 * @format
 * Prompt feedback server functions — BFF bridge to admin-api.
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
      const body = (await response.json()) as { error?: string }
      detail = body.error ? ` — ${body.error}` : ''
    } catch { /* ignore */ }
    throw new Error(`admin-api ${options.method ?? 'GET'} ${path} failed [${response.status}]${detail}`)
  }
  return response.json() as Promise<T>
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const submitFeedbackSchema = z.object({
  invocationId:       z.string().uuid().optional(),
  rating:             z.union([z.literal(1), z.literal(-1)]),
  feedbackText:       z.string().max(500).optional(),
  feedbackCategories: z.array(z.string()).optional(),
})

const statsSchema = z.object({
  days: z.number().int().min(1).max(365).optional().default(30),
})

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface PromptQualityStats {
  pipeline:         string
  agent:            string
  totalInvocations: number
  thumbsUp:         number
  thumbsDown:       number
  badRate:          number
  avgLatencyMs:     number
  avgTotalCostCents: number
  cacheHitRate:     number
}

// ─── Server functions ─────────────────────────────────────────────────────────

export const submitPromptFeedbackFn = createServerFn({ method: 'POST' })
  .inputValidator(submitFeedbackSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const token = getSessionToken()
    await apiFetch('/api/admin/prompt-feedback', token, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return { success: true }
  })

export const getPromptQualityStatsFn = createServerFn({ method: 'GET' })
  .inputValidator(statsSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const token = getSessionToken()
    const response = await apiFetch<{ stats: PromptQualityStats[] }>(
      `/api/admin/prompt-feedback/stats?days=${data.days}`,
      token,
    )
    return response.stats
  })
