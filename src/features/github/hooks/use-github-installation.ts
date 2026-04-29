import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubInstallationFn } from '@/server/github'
import type { GitHubInstallation } from '@/lib/types/github.types'

export function useGitHubInstallation() {
  return useQuery<GitHubInstallation | null>({
    queryKey: adminKeys.github.installation(),
    queryFn: () => getGitHubInstallationFn(),
  })
}
