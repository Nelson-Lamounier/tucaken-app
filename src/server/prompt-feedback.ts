/**
 * @format
 * Prompt feedback server functions — BFF bridge to admin-api.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAdmin, requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

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
    await apiFetch('/prompt-feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return { success: true }
  })

export const getPromptQualityStatsFn = createServerFn({ method: 'GET' })
  .inputValidator(statsSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const response = await apiFetch<{ stats: PromptQualityStats[] }>(
      `/prompt-feedback/stats?days=${data.days}`,
      { pathTemplate: '/prompt-feedback/stats' },
    )
    return response.stats
  })
