'use client'

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { GitBranch, RefreshCw, PanelRightOpen } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DistillationCard } from '@/features/github/components/DistillationCard'
import { GitHubRepoChip } from '@/features/github/components/GitHubRepoChip'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import { Card } from '@/components/ui/Card'
import { scoreColor } from '@/components/ui/tone'
import { cleanRepoTitle } from '@/features/github/lib/distill'
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
  project:   'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  stale:     'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  fork:      'border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  noise:     'border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  abandoned: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
  tutorial:  'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
}

function ClassificationBadge({ value }: { readonly value: RepoClassification }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_STYLES[value] ?? CLASSIFICATION_STYLES.noise}`}>
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
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/8">
          <div
            className={`h-full rounded-full transition-all ${scoreColor(score)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-8 text-right text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
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
                    ? 'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:bg-teal-500/8 dark:text-teal-400'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-400 line-through dark:border-white/8 dark:bg-white/4 dark:text-zinc-600'
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

function RepoCard({ repo, onOpenReview }: { readonly repo: ConnectedRepo; readonly onOpenReview: () => void }) {
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
    <Card as="li" className="flex flex-col gap-4 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitHubRepoChip fullName={repo.repoFullName} />
        {repo.classification && <ClassificationBadge value={repo.classification} />}
        <button
          type="button"
          disabled={isPending || repo.syncStatus === 'syncing'}
          onClick={() => reindex()}
          className="ml-auto flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
          Re-index
        </button>
      </div>

      {/* Profile body */}
      {hasProfile && repo.qualityScore != null ? (
        <ScoreSection score={repo.qualityScore} breakdown={repo.qualityBreakdown} />
      ) : isPendingProfile ? (
        <div className="space-y-2">
          <div className="h-2 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-white/8" />
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 w-12 animate-pulse rounded bg-zinc-200 dark:bg-white/8" />
            ))}
          </div>
        </div>
      ) : repo.extractionStatus === 'failed' ? (
        <p className="text-xs text-red-600 dark:text-red-400">Extraction failed — re-index to retry</p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-600">
          Profile extraction pending — re-index to generate
        </p>
      )}

      {/* Compact preview — full review lives in the slide-over */}
      {hasProfile && repo.oneLiner && (
        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{repo.oneLiner}</p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2">
        <GitHubSyncStatusBadge status={repo.syncStatus} />
        {lastSynced && repo.syncStatus === 'complete' && (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-600">{lastSynced}</span>
        )}
        {hasProfile && (
          <button
            type="button"
            onClick={onOpenReview}
            className="ml-auto inline-flex items-center gap-1 text-xs text-accent transition-opacity hover:opacity-80"
          >
            Full review
            <PanelRightOpen className="size-3.5" />
          </button>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Skeleton placeholder (loading state)
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <Card as="li" className="flex flex-col gap-4 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-36 animate-pulse rounded bg-zinc-200 dark:bg-white/8" />
        <div className="h-5 w-16 animate-pulse rounded bg-zinc-200 dark:bg-white/8" />
      </div>
      <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-white/8" />
      <div className="space-y-2">
        <div className="h-2 w-full animate-pulse rounded bg-zinc-200 dark:bg-white/8" />
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="h-4 w-10 animate-pulse rounded bg-zinc-200 dark:bg-white/8" />
          ))}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function RepoProfileCards({ repos, isLoading }: RepoProfileCardsProps) {
  const [reviewRepo, setReviewRepo] = useState<ConnectedRepo | null>(null)
  let content: React.ReactNode

  if (isLoading) {
    content = (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </ul>
    )
  } else if (repos.length === 0) {
    content = (
      <div className="rounded-xl border border-dashed border-zinc-300 py-10 text-center dark:border-white/10">
        <GitBranch className="mx-auto mb-2 size-7 text-zinc-400 dark:text-zinc-700" />
        <p className="text-sm text-zinc-500">No repositories connected</p>
        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="mt-1.5 inline-block text-xs text-accent transition-opacity hover:opacity-80"
        >
          Connect your first repo →
        </Link>
      </div>
    )
  } else {
    content = (
      <ul className={`grid grid-cols-1 gap-3 ${repos.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {repos.map(repo => (
          <RepoCard
            key={repo.repoFullName}
            repo={repo}
            onOpenReview={() => setReviewRepo(repo)}
          />
        ))}
      </ul>
    )
  }

  return (
    <Card as="section" className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-white/5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Connected Repositories</h3>
        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="text-xs text-accent transition-opacity hover:opacity-80"
        >
          Manage →
        </Link>
      </div>
      <div className="p-6">{content}</div>

      {/* Full-review slide-over — same drawer as the resume preview */}
      <DashboardDrawer
        isOpen={reviewRepo !== null}
        onClose={() => setReviewRepo(null)}
        title={reviewRepo ? cleanRepoTitle(reviewRepo.name) : ''}
        description={reviewRepo?.repoFullName}
      >
        {reviewRepo && (
          <div className="space-y-5">
            {reviewRepo.qualityScore != null && (
              <ScoreSection score={reviewRepo.qualityScore} breakdown={reviewRepo.qualityBreakdown} />
            )}
            <DistillationCard repo={reviewRepo} />
          </div>
        )}
      </DashboardDrawer>
    </Card>
  )
}
