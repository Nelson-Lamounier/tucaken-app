'use client'

/**
 * IngestionSyncWatcher
 *
 * Null-rendering root-level component that closes the resync → UI signal gap:
 * the ingestion Job writes its result to `repo_sync_state` (surfaced as
 * `connectedRepos[].syncStatus`), but nothing told React Query to refresh the
 * KB-derived views when a sync finished — so the "Knowledge Base data health"
 * panel showed stale data after a resync.
 *
 * Mounted once in AppLayout so it watches regardless of the current page. It
 * polls connected-repos ONLY while a sync is active (idle = a single fetch),
 * and on a repo transitioning active → complete it invalidates the KB-health
 * and profile-summary queries so every KB-derived surface reflects the new data.
 */
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubConnectedReposFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import type { ConnectedRepo, RepoSyncStatus } from '@/lib/types/github.types'

const ACTIVE_SYNC_STATUSES = new Set<RepoSyncStatus>(['pending', 'syncing'])
const POLL_INTERVAL = 5_000

export function IngestionSyncWatcher() {
  const queryClient = useQueryClient()
  const addToast = useToastStore((s) => s.addToast)
  const prevStatuses = useRef<Map<string, RepoSyncStatus>>(new Map())

  const { data } = useQuery<ConnectedRepo[]>({
    queryKey: adminKeys.github.connectedRepos(),
    queryFn: () => getGitHubConnectedReposFn(),
    // Poll only while a sync is in flight; idle → no polling (false).
    refetchInterval: (q) =>
      q.state.data?.some((r) => ACTIVE_SYNC_STATUSES.has(r.syncStatus)) ? POLL_INTERVAL : false,
  })

  useEffect(() => {
    if (!data) return
    for (const repo of data) {
      const prev = prevStatuses.current.get(repo.repoFullName)
      const wasActive = prev !== undefined && ACTIVE_SYNC_STATUSES.has(prev)

      if (wasActive && repo.syncStatus === 'complete') {
        // Sync just finished — refresh every KB-derived surface.
        void queryClient.invalidateQueries({ queryKey: adminKeys.kb.health() })
        void queryClient.invalidateQueries({ queryKey: adminKeys.profile.summary() })
        addToast('success', `Knowledge base updated for ${repo.repoFullName}`)
      } else if (wasActive && repo.syncStatus === 'error') {
        addToast('error', `Sync failed for ${repo.repoFullName}`)
      }

      prevStatuses.current.set(repo.repoFullName, repo.syncStatus)
    }
  }, [data, queryClient, addToast])

  return null
}
