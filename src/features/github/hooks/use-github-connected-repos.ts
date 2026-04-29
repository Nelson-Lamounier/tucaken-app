import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubConnectedReposFn } from '@/server/github'
import type { ConnectedRepo } from '@/lib/types/github.types'

const POLL_INTERVAL = 5_000
const POLL_TIMEOUT_MS = 10 * 60 * 1_000
const ACTIVE_SYNC_STATUSES = new Set(['pending', 'syncing'])

export function useGitHubConnectedRepos() {
  const pollStartRef = useRef<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)

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
