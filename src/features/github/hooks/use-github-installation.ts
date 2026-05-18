import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubInstallationFn } from '@/server/github'
import type { GitHubInstallation } from '@/lib/types/github.types'

// Right after a GitHub App install the admin-api can briefly 404 (mapped to
// null) until the installation record is enriched. A bare query would cache
// that null indefinitely (it's a "successful" value, so `retry` never fires).
// Bounded self-heal: while the result is null, refetch a few times shortly
// after mount, then stop — a genuine "not connected" user isn't polled
// forever, but a just-installed user recovers without a manual refresh.
const SELF_HEAL_ATTEMPTS = 4
const SELF_HEAL_INTERVAL_MS = 2_000

export function useGitHubInstallation() {
  return useQuery<GitHubInstallation | null>({
    queryKey: adminKeys.github.installation(),
    queryFn: () => getGitHubInstallationFn(),
    refetchInterval: (query) =>
      query.state.data == null && query.state.dataUpdateCount < SELF_HEAL_ATTEMPTS
        ? SELF_HEAL_INTERVAL_MS
        : false,
  })
}
