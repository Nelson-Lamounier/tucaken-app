import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubAccessibleReposFn } from '@/server/github'
import type { GitHubAccessibleRepo } from '@/lib/types/github.types'

export function useGitHubAccessibleRepos(enabled: boolean) {
  return useQuery<GitHubAccessibleRepo[]>({
    queryKey: adminKeys.github.accessibleRepos(),
    queryFn: () => getGitHubAccessibleReposFn(),
    enabled,
  })
}
