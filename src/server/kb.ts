/**
 * Server functions for Knowledge-Base health. Proxies to the admin-api BFF
 * (`/api/admin/kb`) with the same auth fast-path guard as the other server fns.
 */
import { createServerFn } from '@tanstack/react-start'
import type { KbHealth } from '@/lib/types/kb.types'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

/** Fetch the authenticated user's KB composition (chunks/files per repo). */
export const getKbHealthFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()

  const body = await apiFetch<{ kb: KbHealth }>('/kb/health', {
    pathTemplate: '/kb/health',
  })
  return body.kb
})
