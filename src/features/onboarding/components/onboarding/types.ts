// src/features/onboarding/types.ts
//
// Shared types for the first-run onboarding flow.

import type { GitHubInstallation } from '@/lib/types/github.types'

export type StepId = 'welcome' | 'portfolio' | 'resume' | 'connect' | 'repos' | 'processing' | 'review'

export const STEPS: Array<{ id: StepId; name: string; required: boolean }> = [
  { id: 'welcome',    name: 'Welcome',       required: false },
  { id: 'portfolio',  name: 'Portfolio',     required: false },
  { id: 'resume',     name: 'Resume',        required: false },
  { id: 'connect',    name: 'Connect',       required: true  },
  { id: 'repos',      name: 'Repositories',  required: true  },
  { id: 'processing', name: 'Processing',    required: true  },
  { id: 'review',     name: 'Review',        required: true  },
]

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
