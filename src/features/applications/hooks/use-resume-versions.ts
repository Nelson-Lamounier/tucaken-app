/**
 * useResumeVersions — TanStack Query Hook
 *
 * Fetches all resume versions from `GET /api/admin/resumes` for the
 * resume selector dropdown in the applications analysis form.
 *
 * @module
 */

'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getResumesFn } from '@/server/resumes'

export interface AdminResume {
  readonly resumeId: string
  readonly label: string
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AdminResumeWithData extends AdminResume {
  readonly data: Record<string, unknown>
}

/** Resumes rarely change mid-session — cache aggressively */
const STALE_TIME = 60_000

/**
 * Query options for the resume-version list. Shared by the hook and by route
 * loaders so the data can be prefetched (`ensureQueryData`) and hydrate the
 * client-side query — avoiding a cold fetch on mount.
 */
export const resumeVersionsQueryOptions = () =>
  queryOptions({
    queryKey: adminKeys.resumes.list(),
    queryFn: async (): Promise<AdminResume[]> => {
      const result = await getResumesFn()
      return result as unknown as AdminResume[]
    },
    staleTime: STALE_TIME,
  })

/**
 * Fetches all resume versions for the dropdown selector.
 * Pre-sorts by date (newest first) with the active resume at the top.
 *
 * @returns TanStack Query result with AdminResume[]
 */
export function useResumeVersions() {
  return useQuery(resumeVersionsQueryOptions())
}
