import { useQuery } from '@tanstack/react-query'
import { getTopicCandidatesFn, type TopicCandidate } from '@/server/articles'

/**
 * Suggested article topics mined from the admin's repos (Gap 2). Feeds the
 * "Start from a suggested topic" dropdown. Admin-only in v1.
 */
export function useTopicCandidates() {
  return useQuery<TopicCandidate[]>({
    queryKey: ['admin', 'article-topic-candidates'],
    queryFn: () => getTopicCandidatesFn({ data: {} }),
    staleTime: 60_000,
  })
}
