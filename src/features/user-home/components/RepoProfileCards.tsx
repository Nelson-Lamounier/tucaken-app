'use client'

import { Link } from '@tanstack/react-router'
import { GitBranch, RefreshCw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GitHubRepoChip } from '@/features/github/components/GitHubRepoChip'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import { triggerGitHubIngestionFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'
import type { ConnectedRepo, RepoClassification, ScoreBreakdown } from '@/lib/types/github.types'

interface RepoProfileCardsProps {
  readonly repos: ConnectedRepo[]
  readonly isLoading: boolean
}

// ---------------------------------------------------------------------------
// Classification badge
// ---------------------------------------------------------------------------

const CLASSIFICATION_STYLES: Record<RepoClassification, string> = {
  project:   'border-teal-500/20 bg-teal-500/10 text-teal-300',
  stale:     'border-amber-500/20 bg-amber-500/10 text-amber-300',
  fork:      'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  noise:     'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  abandoned: 'border-red-500/20 bg-red-500/10 text-red-300',
  tutorial:  'border-purple-500/20 bg-purple-500/10 text-purple-300',
}

function ClassificationBadge({ value }: { readonly value: RepoClassification }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_STYLES[value]}`}>
      {value}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Score bar + signal pills
// ---------------------------------------------------------------------------

const SIGNALS: { label: string; key: keyof ScoreBreakdown }[] = [
  { label: 'README',    key: 'has_readme' },
  { label: 'Manifest',  key: 'has_manifest' },
  { label: 'CI',        key: 'has_ci' },
  { label: 'Changelog', key: 'has_changelog' },
  { label: 'Tests',     key: 'has_tests' },
  { label: 'Commits',   key: 'commit_count' },
  { label: 'Conf',      key: 'confidence' },
]

function scoreBarColor(score: number): string {
  if (score >= 0.7) return 'bg-teal-500'
  if (score >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

function ScoreSection({
  score,
  breakdown,
}: {
  readonly score: number
  readonly breakdown: ScoreBreakdown | null | undefined
}) {
  const pct = Math.round(score * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">Quality Score</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-8 text-right text-xs font-semibold tabular-nums text-zinc-300">
          {pct}%
        </span>
      </div>
      {breakdown && (
        <div className="flex flex-wrap gap-1">
          {SIGNALS.map(({ label, key }) => {
            const active = (breakdown[key] ?? 0) > 0
            return (
              <span
                key={key}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                  active
                    ? 'border-teal-500/20 bg-teal-500/8 text-teal-400'
                    : 'border-white/8 bg-white/4 text-zinc-600 line-through'
                }`}
              >
                {label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual card
// ---------------------------------------------------------------------------

function RepoCard({ repo }: { readonly repo: ConnectedRepo }) {
  const queryClient = useQueryClient()
  const { mutate: reindex, isPending } = useMutation({
    mutationFn: () =>
      triggerGitHubIngestionFn({ data: { repoFullName: repo.repoFullName, forceReindex: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() }),
  })

  const lastSynced = repo.lastSyncedAt
    ? new Date(repo.lastSyncedAt).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const hasProfile =
    repo.extractionStatus === 'completed' || repo.extractionStatus === 'ready_for_review'

  const isPendingProfile =
    repo.extractionStatus === 'pending' || repo.extractionStatus === 'extracting'

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitHubRepoChip fullName={repo.repoFullName} />
        {repo.classification && <ClassificationBadge value={repo.classification} />}
        <button
          type="button"
          disabled={isPending || repo.syncStatus === 'syncing'}
          onClick={() => reindex()}
          className="ml-auto flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
          Re-index
        </button>
      </div>

      {/* One-liner */}
      {repo.oneLiner && (
        <p className="text-sm leading-relaxed text-zinc-400">{repo.oneLiner}</p>
      )}

      {/* Profile body */}
      {hasProfile && repo.qualityScore != null ? (
        <ScoreSection score={repo.qualityScore} breakdown={repo.qualityBreakdown} />
      ) : isPendingProfile ? (
        <div className="space-y-2">
          <div className="h-2 w-2/3 animate-pulse rounded bg-white/8" />
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 w-12 animate-pulse rounded bg-white/8" />
            ))}
          </div>
        </div>
      ) : repo.extractionStatus === 'failed' ? (
        <p className="text-xs text-red-400">Extraction failed — re-index to retry</p>
      ) : (
        <p className="text-xs text-zinc-600">
          Profile extraction pending — re-index to generate
        </p>
      )}

      {/* Tech stack + domain + complexity */}
      {hasProfile && (repo.techStack?.length || repo.domain || repo.complexity) && (
        <div className="flex flex-wrap items-center gap-2">
          {repo.domain && (
            <span className="rounded border border-indigo-500/20 bg-indigo-500/8 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
              {repo.domain}
            </span>
          )}
          {repo.techStack?.slice(0, 6).map((tech, i) => (
            <span
              key={`${tech}-${i}`}
              className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400"
            >
              {tech}
            </span>
          ))}
          {repo.complexity && (
            <span className="ml-auto text-[10px] text-zinc-600">{repo.complexity}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2">
        <GitHubSyncStatusBadge status={repo.syncStatus} />
        {lastSynced && repo.syncStatus === 'complete' && (
          <span className="text-[10px] text-zinc-600">{lastSynced}</span>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Skeleton placeholder (loading state)
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-36 animate-pulse rounded bg-white/8" />
        <div className="h-5 w-16 animate-pulse rounded bg-white/8" />
      </div>
      <div className="h-4 w-3/4 animate-pulse rounded bg-white/8" />
      <div className="space-y-2">
        <div className="h-2 w-full animate-pulse rounded bg-white/8" />
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="h-4 w-10 animate-pulse rounded bg-white/8" />
          ))}
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function RepoProfileCards({ repos, isLoading }: RepoProfileCardsProps) {
  let content: React.ReactNode

  if (isLoading) {
    content = (
      <ul className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </ul>
    )
  } else if (repos.length === 0) {
    content = (
      <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
        <GitBranch className="mx-auto mb-2 size-7 text-zinc-700" />
        <p className="text-sm text-zinc-500">No repositories connected</p>
        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="mt-1.5 inline-block text-xs text-teal-400 hover:text-teal-300"
        >
          Connect your first repo →
        </Link>
      </div>
    )
  } else {
    content = (
      <ul className="space-y-3">
        {repos.map(repo => (
          <RepoCard key={repo.repoFullName} repo={repo} />
        ))}
      </ul>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Connected Repositories</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Indexed into your knowledge base</p>
        </div>
        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="text-xs text-teal-400 transition-colors hover:text-teal-300"
        >
          Manage →
        </Link>
      </div>
      {content}
    </section>
  )
}
