// src/features/onboarding/components/steps/ProcessingStep.tsx
//
// Onboarding step 5 — polls repo sync status and navigates to /overview
// once all connected repos reach a terminal state (complete or error).
// No user controls — StepFooter is suppressed for this step by OnboardingShell.

import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'

const TERMINAL_STATUSES = new Set(['complete', 'error'])

export function ProcessingStep() {
  const navigate = useNavigate()
  const { data: connectedRepos } = useGitHubConnectedRepos()

  useEffect(() => {
    if (!connectedRepos || connectedRepos.length === 0) return
    const allTerminal = connectedRepos.every((r) => TERMINAL_STATUSES.has(r.syncStatus))
    if (allTerminal) {
      void navigate({ to: '/overview', replace: true })
    }
  }, [connectedRepos, navigate])

  return (
    <div className="flex h-120 flex-col items-center justify-center gap-6 text-center">
      <div className="relative">
        <motion.div
          className="size-16 rounded-full border-2 border-teal-400/20"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'transform' }}
        />
        <motion.div
          className="absolute inset-0 m-auto size-10 rounded-full bg-teal-500/20 ring-1 ring-teal-400/30"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'opacity' }}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-zinc-100">Indexing your repositories…</p>
        <p className="text-xs text-zinc-500">This usually takes a minute or two</p>
      </div>
    </div>
  )
}
