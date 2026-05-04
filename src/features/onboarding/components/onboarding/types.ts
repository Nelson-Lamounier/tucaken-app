// src/features/onboarding/types.ts
//
// Shared types for the first-run onboarding flow.

export type StepId = 'welcome' | 'portfolio' | 'resume' | 'connect' | 'done'

export const STEPS: Array<{ id: StepId; name: string; required: boolean }> = [
  { id: 'welcome',   name: 'Welcome',   required: false },
  { id: 'portfolio', name: 'Portfolio', required: false },
  { id: 'resume',    name: 'Resume',    required: false },
  { id: 'connect',   name: 'Connect',   required: true  },
  { id: 'done',      name: 'Done',      required: false },
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
}

export interface OnboardingShellProps {
  /** Called when the user submits the portfolio URL on step 2. */
  onSubmitPortfolio?: (url: string) => Promise<void> | void
  /** Called when the user picks a resume file on step 3. Returns parsed summary.
   *  The optional second argument receives live pipeline step messages for the UI. */
  onUploadResume?: (file: File, onProgress?: (step: string) => void) => Promise<ResumeSummary>
  /** Called when the user clicks "Connect GitHub". Should kick off OAuth. */
  onConnectGithub?: () => Promise<void> | void
  /** Called once after step 5. Mark onboarding complete server-side and redirect. */
  onComplete?: () => Promise<void> | void
}
