// src/features/onboarding/components/OnboardingShell.tsx

import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import logo from '@/images/logo.png'
import { OnboardingBackground } from './OnboardingBackground'
import { OnboardingProgress } from './OnboardingProgress'
import { WelcomeStep } from './WelcomeStep'
// PortfolioStep is temporarily unwired from the flow (see types.ts). Import
// intentionally removed; restore it alongside the render branch below.
import { ImportCareerStep } from '../steps/ImportCareerStep'
import { ConnectStep } from './ConnectStep'
import { ConnectReposStep } from '../steps/ConnectReposStep'
import { ProcessingStep } from '../steps/ProcessingStep'
import { useOnboardingState } from './useOnboardingState'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import type { OnboardingShellProps, StepId } from './types'

// Segments shown in the progress bar — processing is silent (no slot).
// The merged `connect` step reads as two segments to the user: GitHub auth,
// then repo selection (which only appears once an installation exists). These
// ids are display-only; see visibleStepIndex below for the machine mapping.
// NOTE: `portfolio` is temporarily unwired (see types.ts); re-add a segment
// here to restore its slot.
const VISIBLE_STEPS = [
  { id: 'welcome', name: 'Welcome' },
  { id: 'resume',  name: 'Resume' },
  { id: 'github',  name: 'GitHub' },
  { id: 'repos',   name: 'Repositories' },
]

// Map the onboarding machine state onto a VISIBLE_STEPS index. The `connect`
// step spans two segments: GitHub auth (2) before an installation exists, then
// repo selection (3) once it does. Single ternary (not nested) per S3358.
function visibleStepIndex(stepId: StepId, hasInstallation: boolean): number {
  if (stepId === 'resume') return 1
  if (stepId === 'connect') return hasInstallation ? 3 : 2
  if (stepId === 'processing') return 3
  return 0 // welcome
}

/**
 * Large logo with NO card/border. A static green glow behind the dark
 * logo keeps it legible against the dark page — no motion.
 *
 * Brand green tokens: teal-400 #2dd4bf, emerald-500 #10b981,
 * tinted highlight teal-100 #ccfbf1.
 */
function LogoBadge() {
  return (
    <div className="relative grid size-28 place-items-center">
      <div
        aria-hidden
        className="absolute size-36 rounded-full bg-[radial-gradient(circle,rgba(204,251,241,0.6),rgba(45,212,191,0.4)_40%,rgba(16,185,129,0)_70%)] blur-lg"
      />
      <img src={logo} alt="Tucaken" className="relative h-24 w-auto" />
    </div>
  )
}

export function OnboardingShell({
  // onSubmitPortfolio is intentionally not destructured while the portfolio
  // step is unwired (see types.ts). The prop is kept on OnboardingShellProps
  // so callers don't break and it can be re-wired without a signature change.
  onConnectGithub,
  installation,
  isLoadingInstallation,
  initialStepIndex = 0,
}: Readonly<OnboardingShellProps>) {
  const navigate = useNavigate()
  const s = useOnboardingState(initialStepIndex)

  const { data: accessibleRepos, isLoading: isLoadingRepos } = useGitHubAccessibleRepos(
    Boolean(installation),
  )
  const { data: connectedRepos } = useGitHubConnectedRepos()

  const variants = {
    enter:  { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit:   { opacity: 0, x: -20 },
  }

  // Portfolio step unwired (see types.ts) — handlePortfolioSubmit removed.
  // Restore it (calling s.setPortfolioUrl + onSubmitPortfolio) when re-adding
  // the step.

  function handleConnectGithub() {
    onConnectGithub?.()
  }

  const visibleIndex = visibleStepIndex(s.stepId, Boolean(installation))
  const isProcessing = s.stepId === 'processing'
  const isTerminal = isProcessing

  // Indexing is the final onboarding step. Once every repo is terminal (or the
  // user continues past failures), hand off to the Knowledge Base dashboard,
  // which surfaces the profile summary, direction, reconciliation, and
  // resume-ready project cards.
  const finishOnboarding = () => void navigate({ to: '/overview', replace: true })

  return (
    <div className="dark relative flex min-h-screen w-full items-stretch justify-center overflow-hidden bg-zinc-950 px-3.75 py-8 text-zinc-200">
      <OnboardingBackground />

      <div className="relative flex w-full max-w-5xl flex-col">
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <LogoBadge />
            <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              {isProcessing ? 'Setting up…' : 'Get started'}
            </span>
          </div>
          {!isTerminal && (
            <OnboardingProgress steps={VISIBLE_STEPS} current={visibleIndex} />
          )}
        </header>

        <main className="flex-1">
          <div className="rounded-2xl p-6 md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={s.stepId}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-160 flex-col"
              >
                {s.stepId === 'welcome' && <WelcomeStep onNext={s.next} />}

                {/*
                  Portfolio step ("Where do you live online?") is temporarily
                  unwired (see types.ts). Restore the <PortfolioStep …/> branch
                  here — with onSubmit={handlePortfolioSubmit} — to re-enable it.
                */}

                {s.stepId === 'resume' && (
                  <ImportCareerStep
                    onNext={s.next}
                    onSkip={s.next}
                    onExtracted={s.setResumeImportId}
                  />
                )}

                {/*
                  Connect + Repositories are merged into one step. Before GitHub
                  is connected we show ConnectStep (auth); once an installation
                  exists we swap to ConnectReposStep (repo picker) in place.
                  Split into two guards (not a ternary) per SonarQube S3358.
                */}
                {s.stepId === 'connect' && !installation && (
                  <ConnectStep
                    installation={installation}
                    isLoadingInstallation={isLoadingInstallation}
                    onConnectGithub={handleConnectGithub}
                    onNext={s.next}
                    onBack={s.back}
                  />
                )}

                {s.stepId === 'connect' && installation && (
                  <ConnectReposStep
                    installation={installation}
                    isLoadingInstallation={isLoadingInstallation ?? false}
                    accessibleRepos={accessibleRepos}
                    isLoadingRepos={isLoadingRepos}
                    connectedRepos={connectedRepos}
                    onNext={s.next}
                    enforceLimit
                  />
                )}

                {s.stepId === 'processing' && <ProcessingStep onNext={finishOnboarding} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
