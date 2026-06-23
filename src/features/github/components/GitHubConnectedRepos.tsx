import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Button } from '@/components/ui/Button'
import { GitHubRepoChip } from './GitHubRepoChip'
import { GitHubSyncStatusBadge } from './GitHubSyncStatusBadge'
import { SyncProgressBar } from './SyncProgressBar'
import { adminKeys } from '@/lib/api/query-keys'
import { triggerGitHubIngestionFn, removeConnectedRepoFn } from '@/server/github'
import { getMeFn } from '@/server/me'
import { useToastStore } from '@/lib/stores/toast-store'
import type { ConnectedRepo } from '@/lib/types/github.types'

interface GitHubConnectedReposProps {
  readonly connectedRepos: ConnectedRepo[] | undefined
}

interface PendingSync {
  repoFullName: string
  forceReindex: boolean
}

/** Centred modal that captures the enrichment-tier choice for test users. */
function EnrichmentModal({
  pending,
  onChoose,
  onClose,
}: {
  readonly pending: PendingSync | null
  readonly onChoose: (choice: 'premium' | 'free') => void
  readonly onClose: () => void
}) {
  return (
    <Dialog open={pending !== null} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <div aria-hidden="true" className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
          <DialogTitle className="text-base font-semibold text-zinc-100">
            Choose enrichment tier
          </DialogTitle>
          <p className="mt-1 text-xs text-zinc-500">
            Select the enrichment level for this sync run.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            {/* Premium option */}
            <button
              type="button"
              onClick={() => onChoose('premium')}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-left transition-colors hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <p className="text-sm font-medium text-zinc-100">Full enrichment (premium)</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                RAG search + technologies + skill enrichment (Bedrock AI cost applies).
              </p>
            </button>

            {/* Free option */}
            <button
              type="button"
              onClick={() => onChoose('free')}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <p className="text-sm font-medium text-zinc-100">Free-tier sync</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Free: RAG search + technologies, no skill enrichment (no AI cost).
              </p>
            </button>
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={onClose} className="px-3 py-1.5 text-xs">
              Cancel
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export function GitHubConnectedRepos({ connectedRepos }: GitHubConnectedReposProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  const me = useQuery({ queryKey: adminKeys.me.detail(), queryFn: getMeFn })
  const canToggle = me.data?.enrichmentToggle ?? false

  // Non-null while the enrichment modal is open — captures which repo + mode to dispatch.
  const [pendingSync, setPendingSync] = useState<PendingSync | null>(null)

  // Incremental: only changed/added/removed files are re-embedded (hash-dedup
  // skips unchanged chunks), so it is cheap and the default action.
  const resync = useMutation({
    mutationFn: ({
      repoFullName,
      enrichment,
    }: {
      repoFullName: string
      enrichment?: 'premium' | 'free'
    }) =>
      triggerGitHubIngestionFn({
        data: { repoFullName, forceReindex: false, enrichment },
      }),
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
    mutationFn: ({
      repoFullName,
      enrichment,
    }: {
      repoFullName: string
      enrichment?: 'premium' | 'free'
    }) =>
      triggerGitHubIngestionFn({
        data: { repoFullName, forceReindex: true, enrichment },
      }),
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

  function handleResync(repoFullName: string) {
    if (canToggle) {
      setPendingSync({ repoFullName, forceReindex: false })
    } else {
      resync.mutate({ repoFullName })
    }
  }

  function handleRebuild(repoFullName: string) {
    if (canToggle) {
      setPendingSync({ repoFullName, forceReindex: true })
    } else {
      if (window.confirm(`Full rebuild of ${repoFullName}? This deletes every indexed chunk and re-embeds from scratch.`)) {
        rebuild.mutate({ repoFullName })
      }
    }
  }

  function handleEnrichmentChoice(choice: 'premium' | 'free') {
    if (!pendingSync) return
    const { repoFullName, forceReindex } = pendingSync
    setPendingSync(null)
    if (forceReindex) {
      rebuild.mutate({ repoFullName, enrichment: choice })
    } else {
      resync.mutate({ repoFullName, enrichment: choice })
    }
  }

  const repos = connectedRepos ?? []

  return (
    <>
      <EnrichmentModal
        pending={pendingSync}
        onChoose={handleEnrichmentChoice}
        onClose={() => setPendingSync(null)}
      />

      <div
        className="rounded-lg border border-white/10 overflow-hidden"
        data-testid={canToggle ? 'enrichment-toggle-active' : undefined}
      >
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
                      onClick={() => handleResync(repo.repoFullName)}
                      disabled={isSyncing || resync.isPending}
                      className="py-1 px-2 text-[10px]"
                    >
                      ↺ Re-sync
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleRebuild(repo.repoFullName)}
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
    </>
  )
}
