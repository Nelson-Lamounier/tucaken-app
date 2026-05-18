import { useState, useMemo } from 'react'
import { Loader2, GitBranch, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GitHubRepoChip } from './GitHubRepoChip'
import { UpgradeLimitBanner } from './UpgradeLimitBanner'
import { useGitHubIngestion } from '../hooks/use-github-ingestion'
import { useGitHubQueueRepo } from '../hooks/use-github-queue-repo'
import type { GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

const PAGE_SIZE = 10

interface GitHubRepoPickerProps {
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoading: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
  readonly maxRepos?: number
  /** 'sync' = immediate ingestion (Settings, default). 'queue' = deferSync queue (onboarding). */
  readonly mode?: 'sync' | 'queue'
}

export function GitHubRepoPicker({ accessibleRepos, isLoading, connectedRepos, maxRepos, mode = 'sync' }: GitHubRepoPickerProps) {
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [queuingRepos, setQueuingRepos] = useState<Set<string>>(new Set())
  const syncIngestion = useGitHubIngestion()
  const queueIngestion = useGitHubQueueRepo()
  const ingestion = mode === 'queue' ? queueIngestion : syncIngestion

  // In queue mode the cap applies to QUEUED (pending) repos only; in sync
  // mode it's the total connected count (Settings behaviour unchanged).
  const connectedCount =
    mode === 'queue'
      ? (connectedRepos ?? []).filter((r) => r.syncStatus === 'pending').length
      : connectedRepos?.length ?? 0
  const atCap = maxRepos !== undefined && connectedCount >= maxRepos

  const connectedSet = useMemo(
    () => new Set((connectedRepos ?? []).map((r) => r.repoFullName)),
    [connectedRepos],
  )

  const sorted = useMemo(
    () => [...(accessibleRepos ?? [])].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
    [accessibleRepos],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sorted.filter((r) => q === '' || r.fullName.toLowerCase().includes(q))
  }, [sorted, search])

  const visible = filtered.slice(0, visibleCount)
  const remaining = filtered.length - visibleCount

  const handleAdd = (fullName: string, defaultBranch: string) => {
    setQueuingRepos((prev) => new Set(prev).add(fullName))
    ingestion.mutate(
      { repoFullName: fullName, defaultBranch },
      {
        onSettled: () => {
          setQueuingRepos((prev) => {
            const next = new Set(prev)
            next.delete(fullName)
            return next
          })
        },
      },
    )
  }

  return (
    <div className="space-y-3">
      {ingestion.needsUpgrade && (
        mode === 'queue' ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <span>Repository limit reached — remove a queued repo to add a different one.</span>
            <button
              type="button"
              onClick={ingestion.dismissUpgrade}
              className="shrink-0 text-amber-400/70 transition hover:text-amber-200"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <UpgradeLimitBanner onDismiss={ingestion.dismissUpgrade} />
        )
      )}
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Repositories</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Select repositories to index into the knowledge base
          </p>
        </div>
        <div>
          {accessibleRepos && (
            <span className="text-xs text-zinc-600">{accessibleRepos.length} accessible</span>
          )}
          {maxRepos !== undefined && (
            <p className="mt-1 text-[11px] text-zinc-500">
              {connectedCount >= maxRepos
                ? `Maximum of ${maxRepos} repositories reached`
                : `${connectedCount} of ${maxRepos} repositories connected`}
            </p>
          )}
        </div>
      </div>

      <div className="border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <input
            type="text"
            placeholder="Search repositories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading repositories…</span>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {visible.map((repo) => {
            const isConnected = connectedSet.has(repo.fullName)
            const isQueuing = queuingRepos.has(repo.fullName)

            return (
              <div
                key={repo.id}
                className={`flex items-center justify-between px-4 py-2.5 ${isConnected ? 'bg-emerald-500/[0.03]' : isQueuing ? 'bg-indigo-500/[0.03]' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <GitHubRepoChip fullName={repo.fullName} />
                  <span className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-500">
                    <GitBranch className="h-2.5 w-2.5" />
                    {repo.defaultBranch}
                  </span>
                  {repo.private && (
                    <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400">
                      private
                    </span>
                  )}
                </div>

                {isConnected ? (
                  <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-400 opacity-70">
                    ✓ Added
                  </span>
                ) : isQueuing ? (
                  <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] text-indigo-400 opacity-80">
                    queuing…
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => handleAdd(repo.fullName, repo.defaultBranch)}
                    disabled={isQueuing || atCap}
                    className="py-1 px-2.5 text-[10px]"
                  >
                    + Add
                  </Button>
                )}
              </div>
            )
          })}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full py-2 text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + {remaining} more repositories
            </button>
          )}

          {filtered.length === 0 && !isLoading && (
            <p className="py-6 text-center text-xs text-zinc-600">
              {search ? 'No repositories match your search.' : 'No accessible repositories found.'}
            </p>
          )}
        </div>
      )}
    </div>
    </div>
  )
}
