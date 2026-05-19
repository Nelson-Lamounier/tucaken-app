import { useQuery } from '@tanstack/react-query'
import { getProfileSummaryFn } from '@/server/profile'
import { adminKeys } from '@/lib/api/query-keys'
import type { ProfileSummary } from '@/lib/types/profile.types'

export function useProfileSummary() {
  return useQuery<ProfileSummary>({
    queryKey: adminKeys.profile.summary(),
    queryFn: () => getProfileSummaryFn(),
    retry: false,
  })
}
