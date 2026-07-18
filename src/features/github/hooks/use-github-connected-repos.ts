import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getConnectedRepoSyncStatusFn, getGitHubConnectedReposFn, markReposTimedOutFn } from '@/server/github'
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

  // The full list GET runs stuck-repo reconciliation (a Kubernetes API call)
  // server-side — correct on page load, far too heavy for a 5 s polling loop
  // (see docs/troubleshooting/slow-ui-5s-api-timeouts-notification-stampede.md).
  // The list never self-polls; the lightweight sync-status probe below drives
  // refetches only when a repo's status actually changes.
  const query = useQuery<ConnectedRepo[]>({
    queryKey: adminKeys.github.connectedRepos(),
    queryFn: () => getGitHubConnectedReposFn(),
  })

  const listData = query.data
  const hasActive = Boolean(listData?.some((r) => ACTIVE_SYNC_STATUSES.has(r.syncStatus)))

  const probe = useQuery({
    queryKey: adminKeys.github.connectedRepoSyncStatus(),
    queryFn: () => getConnectedRepoSyncStatusFn(),
    enabled: hasActive && !timedOut,
    refetchInterval: () => {
      if (timedOut) return false
      if (!pollStartRef.current) pollStartRef.current = Date.now()
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }
      return POLL_INTERVAL
    },
  })

  // Refetch the full (reconciling) list only when the probe reports a change.
  useEffect(() => {
    const probeRepos = probe.data?.repos
    const current = latestDataRef.current
    if (!probeRepos || !current) return
    const changed = probeRepos.some((p) => {
      const match = current.find((r) => r.repoFullName === p.repoFullName)
      return match !== undefined && match.syncStatus !== p.syncStatus
    })
    if (changed) {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
    }
  }, [probe.data, queryClient])

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
      // Best-effort client nudge: the admin-api read-time reconcile and the
      // platform-job-watcher sweep mark stuck repos errored server-side anyway.
      .catch(() => { /* swallow — server-side reconciliation is authoritative */ })
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

  // Restart the polling window after a manual retry: a repo just flipped back
  // to 'pending', so clear the timed-out latch and let refetchInterval resume.
  const resetPolling = useCallback(() => {
    pollStartRef.current = null
    setTimedOut(false)
  }, [])

  return { ...query, timedOut, resetPolling }
}
