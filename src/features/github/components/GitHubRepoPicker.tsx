import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, GitBranch, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EnrichmentModal } from './EnrichmentModal'
import { ProjectIntentModal } from './ProjectIntentModal'
import type { ProjectIntentChoice } from './ProjectIntentModal'
import { GitHubRepoChip } from './GitHubRepoChip'
import { UpgradeLimitBanner } from './UpgradeLimitBanner'
import { useGitHubIngestion } from '../hooks/use-github-ingestion'
import { useGitHubQueueRepo } from '../hooks/use-github-queue-repo'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'
import { projectsQueries } from '@/features/projects/server/queries'
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

  // Enrichment-tier toggle (free vs premium) for allowlisted test users, on the
  // immediate-sync Add path. When enabled, the Add CTA opens the choice modal
  // instead of dispatching straight away — so an add never silently runs paid
  // enrichment. Non-allowlisted users keep the unchanged direct-add behaviour.
  const me = useQuery({ queryKey: adminKeys.me.detail(), queryFn: getMeFn })
  const canToggle = (me.data?.enrichmentToggle ?? false) && mode === 'sync'
  const [pendingAdd, setPendingAdd] = useState<{ repoFullName: string; defaultBranch: string } | null>(null)
  const [pendingIntent, setPendingIntent] = useState<{ repoFullName: string; defaultBranch: string; enrichment?: 'premium' | 'free' } | null>(null)

  // Confirmed projects for the link-to-existing picker in ProjectIntentModal.
  // is_user_confirmed === true is the same predicate used by isCurated in classify.ts.
  const projectsQuery = useQuery(projectsQueries.list({ limit: 100, offset: 0 }))
  const confirmedProjects = useMemo(
    () =>
      (projectsQuery.data?.items ?? [])
        .filter((p) => p.is_user_confirmed === true)
        .map((p) => ({ id: p.id, name: p.name })),
    [projectsQuery.data],
  )

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

  const doAdd = (
    fullName: string,
    defaultBranch: string,
    enrichment?: 'premium' | 'free',
    intent?: { projectIntent: 'build' | 'link' | 'none'; targetProjectId?: string },
  ) => {
    setQueuingRepos((prev) => new Set(prev).add(fullName))
    ingestion.mutate(
      {
        repoFullName: fullName,
        defaultBranch,
        enrichment,
        projectIntent:   intent?.projectIntent,
        targetProjectId: intent?.targetProjectId,
      },
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

  const handleAdd = (fullName: string, defaultBranch: string) => {
    // Allowlisted test users choose the enrichment tier first; then both paths
    // continue to ProjectIntentModal so intent is always captured on Add.
    if (canToggle) {
      setPendingAdd({ repoFullName: fullName, defaultBranch })
    } else {
      setPendingIntent({ repoFullName: fullName, defaultBranch })
    }
  }

  const handleEnrichmentChoice = (choice: 'premium' | 'free') => {
    if (!pendingAdd) return
    const { repoFullName, defaultBranch } = pendingAdd
    setPendingAdd(null)
    // Carry the enrichment choice forward into the intent modal (shown next).
    setPendingIntent({ repoFullName, defaultBranch, enrichment: choice })
  }

  const handleIntentChoice = (choice: ProjectIntentChoice) => {
    if (!pendingIntent) return
    const { repoFullName, defaultBranch, enrichment } = pendingIntent
    setPendingIntent(null)
    if (choice.intent === 'link') {
      doAdd(repoFullName, defaultBranch, enrichment, { projectIntent: 'link', targetProjectId: choice.targetProjectId })
    } else {
      doAdd(repoFullName, defaultBranch, enrichment, { projectIntent: choice.intent })
    }
  }

  return (
    <div className="space-y-3" data-testid={canToggle ? 'add-enrichment-toggle-active' : undefined}>
      <EnrichmentModal
        open={pendingAdd !== null}
        onChoose={handleEnrichmentChoice}
        onClose={() => setPendingAdd(null)}
      />
      <ProjectIntentModal
        open={pendingIntent !== null}
        projects={confirmedProjects}
        onChoose={handleIntentChoice}
        onClose={() => setPendingIntent(null)}
      />

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
