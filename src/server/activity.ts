/**
 * @format
 * User-facing activity + KB-health server functions.
 *
 * requireAuth() is a fast-path edge guard; the admin-api BFF re-verifies the JWT
 * and scopes every query to the caller's own user_id. These are NOT admin-gated.
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { ActivitySeries, KbHealth } from '@/lib/types/rag.types'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

const daysSchema = z
  .object({ days: z.number().int().min(1).max(90).default(30) })
  .default({ days: 30 })

/** Applications + resumes the caller generated per day (dense, zero-filled). */
export const getDailyActivityFn = createServerFn({ method: 'GET' })
  .inputValidator(daysSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<ActivitySeries>(`/activity/daily?days=${data.days}`, {
      pathTemplate: '/activity/daily',
    })
  })

/** The caller's own repositories' KB quality (chunks/files processed + totals). */
export const getKbHealthFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    await requireAuth()
    return apiFetch<KbHealth>('/activity/kb-health', { pathTemplate: '/activity/kb-health' })
  })
