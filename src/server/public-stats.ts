/**
 * GET /api/public/stats — unauthenticated platform social-proof counts.
 *
 * Feeds the marketing home stats band with real figures (total registered
 * developers, total resumes generated) instead of invented placeholders.
 *
 * Uses a raw fetch (not apiFetch) because the marketing page is anonymous:
 * apiFetch requires the `__session` cookie and throws without it. Mirrors
 * getPublicTierConfigFn in ./tier-config.
 */
import { createServerFn } from '@tanstack/react-start'

export interface PublicStats {
  /** Total registered people (one row per person, not per identity). */
  users: number
  /** Total resumes generated across all users. */
  resumes: number
}

const ADMIN_API_URL = process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

export const getPublicStatsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublicStats> => {
    const res = await fetch(`${ADMIN_API_URL}/api/public/stats`)
    if (!res.ok) {
      throw new Error(`public stats fetch failed [${res.status}]`)
    }
    return (await res.json()) as PublicStats
  },
)
