import { createServerFn } from '@tanstack/react-start'
import type { ProfileSummary } from '@/lib/types/profile.types'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

export const getProfileSummaryFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  return apiFetch<ProfileSummary>('/profile/summary')
})
