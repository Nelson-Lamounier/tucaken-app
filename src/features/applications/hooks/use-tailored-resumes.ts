import { queryOptions, useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getTailoredResumesFn, type TailoredResumeSummary } from '@/server/applications'

/** Tailored resumes change rarely within a session. */
const STALE_TIME = 60_000

export const tailoredResumesQueryOptions = () =>
  queryOptions({
    queryKey: adminKeys.applications.tailoredResumes,
    queryFn: () => getTailoredResumesFn(),
    staleTime: STALE_TIME,
  })

/** Index tailored resumes by application slug for O(1) per-row lookup. */
export function buildTailoredMap(
  list: readonly TailoredResumeSummary[] | undefined,
): Map<string, TailoredResumeSummary> {
  const map = new Map<string, TailoredResumeSummary>()
  if (!list) return map
  for (const item of list) map.set(item.slug, item)
  return map
}

export function useTailoredResumes() {
  return useQuery(tailoredResumesQueryOptions())
}
