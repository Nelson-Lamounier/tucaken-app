import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubConnectedReposFn, markReposTimedOutFn } from '@/server/github'
import type { ConnectedRepo } from '@/lib/types/github.types'

const POLL_INTERVAL = 5_000
// Production repo ingestion can take up to ~15 min; poll until then before
// marking stuck repos errored.
const POLL_TIMEOUT_MS = 15 * 60 * 1_000
const ACTIVE_SYNC_STATUSES = new Set(['pending', 'syncing'])

export function useGitHubConnectedRepos() {
  const pollStartRef = useRef<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const queryClient = useQueryClient()

  // Keep a ref to the latest data so the timeout effect doesn't close over stale data.
  const latestDataRef = useRef<ConnectedRepo[] | undefined>(undefined)

  const query = useQuery<ConnectedRepo[]>({
    queryKey: adminKeys.github.connectedRepos(),
    queryFn: () => getGitHubConnectedReposFn(),
    refetchInterval: (queryResult) => {
      if (timedOut) return false

      const data = queryResult.state.data
      if (!data) return false

      const hasActive = data.some((r) => ACTIVE_SYNC_STATUSES.has(r.syncStatus))
      if (!hasActive) return false

      if (!pollStartRef.current) pollStartRef.current = Date.now()

      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }

      return POLL_INTERVAL
    },
  })

  latestDataRef.current = query.data

  // When polling times out, mark the stuck repos as 'error' in the DB.
  // This ensures the failure persists across page refreshes rather than
  // re-showing 'pending' indefinitely on next load.
  useEffect(() => {
    if (!timedOut) return
    const staleRepos = latestDataRef.current?.filter((r) =>
      ACTIVE_SYNC_STATUSES.has(r.syncStatus),
    )
    if (!staleRepos?.length) return
    void markReposTimedOutFn({
      data: { repoFullNames: staleRepos.map((r) => r.repoFullName) },
    })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() }),
      )
      .catch(console.error)
  }, [timedOut, queryClient])

  useEffect(() => {
    const data = query.data
    if (!data) return
    const hasActive = data.some((r) => ACTIVE_SYNC_STATUSES.has(r.syncStatus))
    if (!hasActive) {
      pollStartRef.current = null
      setTimedOut(false)
    }
  }, [query.data])

  return { ...query, timedOut }
}
