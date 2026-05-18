'use client'

// Onboarding processing step — triggers the bulk sync for all queued
// repos, then shows full-screen Document-style progress (Typewriter
// heading + circular gradient ring for aggregate progress) plus a
// per-repo SyncProgressBar list, and advances to Review once every repo
// is terminal (complete or error). StepFooter is suppressed for this
// step by OnboardingShell.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Typewriter } from '@/components/ui/Typewriter'
import { SyncProgressBar } from '@/features/github/components/SyncProgressBar'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { startConnectedReposSyncFn } from '@/server/github'

const TERMINAL_STATUSES = new Set(['complete', 'error'])

// Progress-ring geometry: r=44 in a 96×96 viewBox.
const RING_RADIUS = 44
const RING_CIRC = 2 * Math.PI * RING_RADIUS

interface ProcessingStepProps {
  readonly onNext: () => void
}

export function ProcessingStep({ onNext }: ProcessingStepProps) {
  const { data: connectedRepos } = useGitHubConnectedRepos()
  const startedRef = useRef(false)
  const [startError, setStartError] = useState<string | null>(null)

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
  const pct = total === 0 ? 0 : Math.round((terminalCount / total) * 100)

  useEffect(() => {
    if (total > 0 && terminalCount === total) onNext()
  }, [total, terminalCount, onNext])

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
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <span className="truncate text-xs font-medium text-zinc-200">{repo.repoFullName}</span>
            {repo.syncStatus === 'pending' || repo.syncStatus === 'syncing' ? (
              <SyncProgressBar />
            ) : (
              <GitHubSyncStatusBadge status={repo.syncStatus} />
            )}
          </div>
        ))}
        {total === 0 && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Preparing…
          </div>
        )}
      </div>

      <p className="text-center text-xs text-zinc-600">
        This can take several minutes (up to ~15 in some cases). You can leave this page — we'll keep indexing.
      </p>
    </div>
  )
}
