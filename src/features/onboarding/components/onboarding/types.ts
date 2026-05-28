// src/features/onboarding/types.ts
//
// Shared types for the first-run onboarding flow.

import type { GitHubInstallation } from '@/lib/types/github.types'

// Onboarding ends at `processing`. Once indexing finishes, the user is
// redirected to /overview (the Knowledge Base dashboard), which surfaces the
// profile summary, direction, reconciliation, and resume-ready project cards
// that used to be their own onboarding steps.
//
// NOTE: the `portfolio` step ("Where do you live online?") is temporarily
// unwired from the flow — PortfolioStep.tsx and `OnboardingData.portfolioUrl`
// are kept so it can be re-added later. To restore it, re-add 'portfolio'
// here, in STEP_INDEX (useOnboardingState), in VISIBLE_STEPS, and the render
// branch in OnboardingShell.
//
// The `connect` step now also covers repository selection: OnboardingShell
// renders ConnectStep (GitHub auth) until an installation exists, then swaps
// to ConnectReposStep (repo picker) in the same step. The old standalone
// `repos` step was merged in here.
export type StepId = 'welcome' | 'resume' | 'connect' | 'processing'

export const STEPS: Array<{ id: StepId; name: string; required: boolean }> = [
  { id: 'welcome',        name: 'Welcome',       required: false },
  { id: 'resume',         name: 'Resume',        required: false },
  { id: 'connect',        name: 'Connect',       required: true  },
  { id: 'processing',     name: 'Processing',    required: true  },
]

// Index of the merged GitHub connect+repos step. Derived from STEPS so the
// post-install redirect target (used by both onboarding.tsx and the
// github.callback.tsx return path) can never drift from the step order.
export const CONNECT_STEP_INDEX = STEPS.findIndex((s) => s.id === 'connect')

export interface ResumeSummary {
  roles: number
  education: number
  skills: number
}

export interface OnboardingData {
  portfolioUrl?: string
  resume?: { fileName: string; summary: ResumeSummary }
  githubConnected: boolean
  reposConnected: boolean
  resumeImportId?: string
}

export interface OnboardingShellProps {
  onSubmitPortfolio?: (url: string) => Promise<void> | void
  /** Sync redirect to GitHub App install URL. */
  onConnectGithub?: () => void
  installation?: GitHubInstallation | null
  isLoadingInstallation?: boolean
  /** Step index to restore after GitHub install redirect (0 = welcome). */
  initialStepIndex?: number
}
