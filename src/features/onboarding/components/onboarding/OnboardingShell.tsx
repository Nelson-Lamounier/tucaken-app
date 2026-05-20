// src/features/onboarding/components/OnboardingShell.tsx

import { AnimatePresence, motion } from 'motion/react'
import logo from '@/images/logo.png'
import { OnboardingBackground } from './OnboardingBackground'
import { OnboardingProgress } from './OnboardingProgress'
import { WelcomeStep } from './WelcomeStep'
import { PortfolioStep } from './PortfolioStep'
import { ImportCareerStep } from '../steps/ImportCareerStep'
import { ConnectStep } from './ConnectStep'
import { ConnectReposStep } from '../steps/ConnectReposStep'
import { ProcessingStep } from '../steps/ProcessingStep'
import { ReviewStep } from '../steps/ReviewStep'
import { DistillStep } from '../steps/DistillStep'
import { MirrorStep } from '../steps/MirrorStep'
import { DirectionStep } from '../steps/DirectionStep'
import { ReconciliationStep } from '../steps/ReconciliationStep'
import { useOnboardingState } from './useOnboardingState'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import type { OnboardingShellProps } from './types'

// Steps shown in the progress bar — processing is silent (no indicator slot)
const VISIBLE_STEPS = [
  { id: 'welcome'   as const, name: 'Welcome' },
  { id: 'portfolio' as const, name: 'Portfolio' },
  { id: 'resume'    as const, name: 'Resume' },
  { id: 'connect'   as const, name: 'Connect' },
  { id: 'repos'     as const, name: 'Repositories' },
]

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
  onSubmitPortfolio,
  onConnectGithub,
  installation,
  isLoadingInstallation,
  initialStepIndex = 0,
}: Readonly<OnboardingShellProps>) {
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

  async function handlePortfolioSubmit(url: string) {
    s.setPortfolioUrl(url)
    await onSubmitPortfolio?.(url)
  }

  function handleConnectGithub() {
    onConnectGithub?.()
  }

  // mirror, direction, reconciliation, distill, processing, and review are terminal — no progress-bar slot; clamp to the last visible step
  const visibleIndex = Math.min(s.stepIndex, VISIBLE_STEPS.length - 1)
  const isProcessing = s.stepId === 'processing'
  const isTerminal = isProcessing || s.stepId === 'mirror' || s.stepId === 'direction' || s.stepId === 'reconciliation' || s.stepId === 'distill' || s.stepId === 'review'

  return (
    <div className="dark relative flex min-h-screen w-full items-stretch justify-center overflow-hidden bg-zinc-950 px-3.75 py-8 text-zinc-200">
      <OnboardingBackground />

      <div className="relative flex w-full max-w-5xl flex-col">
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <LogoBadge />
            <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              {isTerminal ? (isProcessing ? 'Setting up…' : 'Almost done') : 'Get started'}
            </span>
          </div>
          {!isTerminal && (
            <OnboardingProgress
              steps={VISIBLE_STEPS}
              current={visibleIndex}
              onJump={s.jumpTo}
            />
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

                {s.stepId === 'portfolio' && (
                  <PortfolioStep
                    initialValue={s.data.portfolioUrl}
                    onSubmit={handlePortfolioSubmit}
                    onNext={s.next}
                    onSkip={s.next}
                    onBack={s.back}
                  />
                )}

                {s.stepId === 'resume' && (
                  <ImportCareerStep
                    onNext={s.next}
                    onSkip={s.next}
                    onExtracted={s.setResumeImportId}
                  />
                )}

                {s.stepId === 'connect' && (
                  <ConnectStep
                    installation={installation}
                    isLoadingInstallation={isLoadingInstallation}
                    onConnectGithub={handleConnectGithub}
                    onNext={s.next}
                    onBack={s.back}
                  />
                )}

                {s.stepId === 'repos' && (
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

                {s.stepId === 'processing' && <ProcessingStep onNext={s.next} />}

                {s.stepId === 'mirror' && (
                  <MirrorStep onNext={s.next} onBack={s.back} />
                )}

                {s.stepId === 'direction' && (
                  <DirectionStep onNext={s.next} onBack={s.back} />
                )}

                {s.stepId === 'reconciliation' && (
                  <ReconciliationStep onNext={s.next} onBack={s.back} />
                )}

                {s.stepId === 'distill' && (
                  <DistillStep onNext={s.next} onBack={s.back} />
                )}

                {s.stepId === 'review' && (
                  <ReviewStep importId={s.data.resumeImportId} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
