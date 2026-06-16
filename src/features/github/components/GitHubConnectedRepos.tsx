import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { GitHubRepoChip } from './GitHubRepoChip'
import { GitHubSyncStatusBadge } from './GitHubSyncStatusBadge'
import { SyncProgressBar } from './SyncProgressBar'
import { adminKeys } from '@/lib/api/query-keys'
import { triggerGitHubIngestionFn, removeConnectedRepoFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import type { ConnectedRepo } from '@/lib/types/github.types'

interface GitHubConnectedReposProps {
  readonly connectedRepos: ConnectedRepo[] | undefined
}

export function GitHubConnectedRepos({ connectedRepos }: GitHubConnectedReposProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  // Incremental: only changed/added/removed files are re-embedded (hash-dedup
  // skips unchanged chunks), so it is cheap and the default action.
  const resync = useMutation({
    mutationFn: (repoFullName: string) =>
      triggerGitHubIngestionFn({ data: { repoFullName, forceReindex: false } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      addToast('success', 'Re-sync queued.')
    },
    onError: (err: Error) => {
      addToast('error', `Re-sync failed: ${err.message}`)
    },
  })

  // Full rebuild: deletes every chunk for the repo and re-embeds from scratch
  // (full Bedrock cost). Explicit + confirmed because it is destructive.
  const rebuild = useMutation({
    mutationFn: (repoFullName: string) =>
      triggerGitHubIngestionFn({ data: { repoFullName, forceReindex: true } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      addToast('success', 'Full rebuild queued.')
    },
    onError: (err: Error) => {
      addToast('error', `Rebuild failed: ${err.message}`)
    },
  })

  const remove = useMutation({
    mutationFn: (repoFullName: string) =>
      removeConnectedRepoFn({ data: { repoFullName } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
      addToast('success', 'Repository removed.')
    },
    onError: (err: Error) => {
      addToast('error', `Remove failed: ${err.message}`)
    },
  })

  const repos = connectedRepos ?? []

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Connected Repositories</p>
          <p className="mt-0.5 text-xs text-zinc-500">Indexed into the Bedrock knowledge base</p>
        </div>
        {repos.length > 0 && (
          <span className="text-xs text-zinc-600">{repos.length} connected</span>
        )}
      </div>

      {repos.length === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-600">
          No repositories connected yet. Add one from the list above.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {repos.map((repo) => {
            const isSyncing = repo.syncStatus === 'syncing'
            const lastSynced = repo.lastSyncedAt
              ? new Date(repo.lastSyncedAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : null

            return (
              <div
                key={repo.repoFullName}
                className={`flex items-center justify-between px-4 py-2.5 ${isSyncing ? 'bg-indigo-500/[0.02]' : repo.syncStatus === 'error' ? 'bg-red-500/[0.02]' : ''}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <GitHubRepoChip fullName={repo.repoFullName} />
                  {isSyncing ? (
                    <SyncProgressBar />
                  ) : (
                    <GitHubSyncStatusBadge status={repo.syncStatus} />
                  )}
                  {repo.syncStatus === 'complete' && lastSynced && (
                    <span className="text-[10px] text-zinc-600">{lastSynced}</span>
                  )}
                  {repo.syncStatus === 'error' && (
                    <span className="text-[10px] text-red-400/70">
                      {repo.errorMessage ?? 'Ingestion failed'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => resync.mutate(repo.repoFullName)}
                    disabled={isSyncing || resync.isPending}
                    className="py-1 px-2 text-[10px]"
                  >
                    ↺ Re-sync
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(`Full rebuild of ${repo.repoFullName}? This deletes every indexed chunk and re-embeds from scratch.`)) {
                        rebuild.mutate(repo.repoFullName)
                      }
                    }}
                    disabled={isSyncing || rebuild.isPending}
                    className="py-1 px-2 text-[10px]"
                  >
                    ⟳ Rebuild
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => remove.mutate(repo.repoFullName)}
                    disabled={remove.isPending}
                    className="py-1 px-2 text-[10px]"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
