'use client'

// Onboarding processing step — triggers the bulk sync for all queued
// repos, then shows full-screen Document-style progress (Typewriter
// heading + circular gradient ring for aggregate progress) plus a
// per-repo SyncProgressBar list, and advances to Review once every repo
// is terminal (complete or error). StepFooter is suppressed for this
// step by OnboardingShell.

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { CheckCircle2, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Typewriter } from '@/components/ui/Typewriter'
import { SyncProgressBar } from '@/features/github/components/SyncProgressBar'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { startConnectedReposSyncFn, retryConnectedRepoFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'
import type { ConnectedRepo } from '@/lib/types/github.types'

const TERMINAL_STATUSES = new Set(['complete', 'error'])

// Per-repo progress fraction in [0,1]. Terminal repos count as fully done; a
// syncing repo contributes its intra-repo embed progress (embedded/total) when
// the pipeline has reported it, else 0. Early returns (not nested ternaries)
// keep this SonarQube-clean (S3358).
function repoProgressFraction(repo: ConnectedRepo): number {
  if (TERMINAL_STATUSES.has(repo.syncStatus)) return 1
  if (
    repo.syncStatus === 'syncing' &&
    typeof repo.embedTotal === 'number' &&
    repo.embedTotal > 0 &&
    typeof repo.embeddedCount === 'number'
  ) {
    return Math.min(repo.embeddedCount / repo.embedTotal, 1)
  }
  return 0
}
const ACTIVE_STATUSES = new Set(['pending', 'syncing'])

// Per-repo status control. Early returns (not a nested ternary) keep this
// SonarQube-clean while rendering one of: progress bar (active), error badge +
// Retry (failed), or a plain status badge (complete).
function RepoRowStatus({
  repo,
  isRetrying,
  onRetry,
}: {
  readonly repo: ConnectedRepo
  readonly isRetrying: boolean
  readonly onRetry: (repoFullName: string) => void
}) {
  if (ACTIVE_STATUSES.has(repo.syncStatus)) return <SyncProgressBar />
  if (repo.syncStatus === 'error') {
    return (
      <div className="flex items-center gap-2">
        <GitHubSyncStatusBadge status="error" />
        <Button
          variant="secondary"
          onClick={() => onRetry(repo.repoFullName)}
          disabled={isRetrying}
          className="flex items-center gap-1 px-2 py-0.5 text-xs"
        >
          {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
          {isRetrying ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    )
  }
  return <GitHubSyncStatusBadge status={repo.syncStatus} />
}

// Progress-ring geometry: r=44 in a 96×96 viewBox.
const RING_RADIUS = 44
const RING_CIRC = 2 * Math.PI * RING_RADIUS

// How long the "All done" screen stays up before redirecting to /overview.
const ALL_DONE_DISPLAY_MS = 2200

// Terminal success screen shown once every repo has indexed, just before the
// hand-off to the dashboard. Animates a spring-scaled check + fade-up copy;
// only transform/opacity are animated (composited) and flagged on willChange.
function AllDoneScreen() {
  return (
    <motion.div
      key="all-done"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-100 flex-col items-center justify-center gap-6 text-center"
    >
      <motion.div
        className="relative grid size-24 place-items-center rounded-full"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.45, visualDuration: 0.6 }}
        style={{ willChange: 'transform, opacity' }}
      >
        <div aria-hidden className="absolute inset-0 rounded-full bg-emerald-400/15 blur-[2px]" />
        <CheckCircle2 className="relative size-14 text-emerald-300" strokeWidth={1.75} />
      </motion.div>

      <div className="space-y-2">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'transform, opacity' }}
          className="text-3xl font-bold leading-[1.1] text-zinc-50 md:text-4xl"
        >
          All done
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'transform, opacity' }}
          className="text-lg font-semibold text-teal-100/90"
        >
          Your knowledge base is ready.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="flex items-center gap-2 text-xs text-teal-200/70"
      >
        <Loader2 className="size-3.5 animate-spin" />
        Taking you to your dashboard…
      </motion.div>
    </motion.div>
  )
}

interface ProcessingStepProps {
  readonly onNext: () => void
}

export function ProcessingStep({ onNext }: ProcessingStepProps) {
  const { data: connectedRepos, resetPolling } = useGitHubConnectedRepos()
  const queryClient = useQueryClient()
  const startedRef = useRef(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set())
  const [retryError, setRetryError] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  // Trigger the bulk sync once on mount (queued → syncing).
  const triggerSync = () => {
    setStartError(null)
    startConnectedReposSyncFn()
      .catch((err: unknown) => {
        setStartError(err instanceof Error ? err.message : 'Failed to start indexing')
      })
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    triggerSync()
  }, [])

  const repos = connectedRepos ?? []
  const total = repos.length
  const terminalCount = repos.filter((r) => TERMINAL_STATUSES.has(r.syncStatus)).length
  const failedRepos = repos.filter((r) => r.syncStatus === 'error')
  const allTerminal = total > 0 && terminalCount === total
  const allSucceeded = allTerminal && failedRepos.length === 0

  // When EVERY repo indexed cleanly, show the "All done" screen. Any failure
  // blocks the step so the user can retry (or skip) instead of moving on.
  useEffect(() => {
    if (allSucceeded) setShowDone(true)
  }, [allSucceeded])

  // After the All-done screen has displayed briefly, hand off to /overview.
  useEffect(() => {
    if (!showDone) return
    const timer = setTimeout(onNext, ALL_DONE_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [showDone, onNext])

  const handleRetry = (repoFullName: string) => {
    setRetryError(null)
    setRetrying((prev) => new Set(prev).add(repoFullName))
    retryConnectedRepoFn({ data: { repoFullName } })
      .then(() => {
        // Repo is 'pending' again — resume the polling window and refetch.
        resetPolling()
        return queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      })
      .catch((err: unknown) => {
        setRetryError(err instanceof Error ? err.message : 'Failed to retry indexing')
      })
      .finally(() => {
        setRetrying((prev) => {
          const next = new Set(prev)
          next.delete(repoFullName)
          return next
        })
      })
  }

  // Aggregate ring reflects fractional progress across all repos, so a single
  // in-flight repo advances the ring as its chunks embed instead of jumping
  // 0→100 only when the whole repo finishes.
  const progressSum = repos.reduce((sum, r) => sum + repoProgressFraction(r), 0)
  const pct = total === 0 ? 0 : Math.round((progressSum / total) * 100)

  // Terminal success: swap the progress UI for the "All done" hand-off screen.
  if (showDone) return <AllDoneScreen />

  return (
    <div className="space-y-8">
      <Typewriter
        key="indexing-title"
        as="h3"
        text="Indexing your repositories"
        className="text-3xl font-bold leading-[1.1] text-zinc-50 md:text-4xl"
        speed={45}
      />

      <p className="text-lg font-semibold leading-snug text-teal-100/90 md:text-xl">
        {total === 0
          ? 'Starting…'
          : `${terminalCount} of ${total} ${total === 1 ? 'repository' : 'repositories'} indexed`}
      </p>

      <div className="mx-auto flex w-full max-w-[16rem] flex-col items-center gap-6 px-6 py-10">
        <div className="relative h-28 w-28">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full opacity-70 blur-[2px]"
            style={{
              willChange: 'transform',
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgba(20,184,166,0.55) 110deg, rgba(16,185,129,0.55) 230deg, transparent 360deg)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
          />
          <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
            <defs>
              <linearGradient id="proc-repos-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <circle cx="48" cy="48" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
            <motion.circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              stroke="url(#proc-repos-ring)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              initial={false}
              animate={{ strokeDashoffset: RING_CIRC * (1 - pct / 100) }}
              transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.6 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-teal-100">{pct}%</span>
          </div>
        </div>
      </div>

      {startError && (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-300">{startError}</p>
          <Button variant="secondary" onClick={triggerSync} className="flex items-center gap-1.5">
            Retry
          </Button>
        </div>
      )}
      <div className="mx-auto w-full max-w-md space-y-2">
        {repos.map((repo) => (
          <div
            key={repo.repoFullName}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium text-zinc-200">{repo.repoFullName}</span>
              {repo.syncStatus === 'error' && repo.errorMessage && (
                <span className="truncate text-[0.7rem] text-red-300/80">{repo.errorMessage}</span>
              )}
            </div>
            <RepoRowStatus
              repo={repo}
              isRetrying={retrying.has(repo.repoFullName)}
              onRetry={handleRetry}
            />
          </div>
        ))}
        {total === 0 && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Preparing…
          </div>
        )}
      </div>

      {retryError && (
        <p className="text-center text-sm text-red-300">{retryError}</p>
      )}

      {allTerminal && failedRepos.length > 0 && (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-4 text-center">
          <p className="text-sm font-medium text-red-200">
            {failedRepos.length} of {total} {failedRepos.length === 1 ? 'repository' : 'repositories'} failed to index.
          </p>
          <p className="text-xs text-zinc-400">
            Retry the failed {failedRepos.length === 1 ? 'repository' : 'repositories'} above, or continue and finish them later from Settings.
          </p>
          <Button variant="secondary" onClick={onNext}>
            Continue anyway
          </Button>
        </div>
      )}

      {!allTerminal && (
        <p className="text-center text-xs text-zinc-600">
          This can take several minutes (up to ~15 in some cases). You can leave this page — we'll keep indexing.
        </p>
      )}
    </div>
  )
}
