import { useQuery } from '@tanstack/react-query'
import { getProfileSummaryFn } from '@/server/profile'
import { adminKeys } from '@/lib/api/query-keys'
import type { ProfileSummary } from '@/lib/types/profile.types'

const SYNTHESIS_POLL_MS = 8000

export function useProfileSummary() {
  return useQuery<ProfileSummary>({
    queryKey: adminKeys.profile.summary(),
    queryFn: () => getProfileSummaryFn(),
    retry: false,
    // Synthesis lands asynchronously after ingestion finishes. Override the
    // global 5-min staleTime so navigating to the overview always refetches,
    // and poll until synthesis has run so freshly-generated panels appear
    // without a manual page refresh.
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.synthesisRefreshedAt ? false : SYNTHESIS_POLL_MS,
    refetchIntervalInBackground: false,
  })
}
