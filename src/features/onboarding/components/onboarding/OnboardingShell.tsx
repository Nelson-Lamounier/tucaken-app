// src/features/onboarding/components/OnboardingShell.tsx

import { AnimatePresence, motion } from 'motion/react'
import { OnboardingBackground } from './OnboardingBackground'
import { OnboardingProgress } from './OnboardingProgress'
import { WelcomeStep } from './WelcomeStep'
import { PortfolioStep } from './PortfolioStep'
import { ImportCareerStep } from '../steps/ImportCareerStep'
import { ConnectStep } from './ConnectStep'
import { ConnectReposStep } from '../steps/ConnectReposStep'
import { ProcessingStep } from '../steps/ProcessingStep'
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

  // processing step has no visible progress slot — clamp to last visible step
  const visibleIndex = Math.min(s.stepIndex, VISIBLE_STEPS.length - 1)
  const isProcessing = s.stepId === 'processing'

  return (
    <div className="dark relative flex min-h-screen w-full items-stretch justify-center overflow-hidden bg-zinc-950 px-4 py-8 text-zinc-200">
      <OnboardingBackground />

      <div className="relative flex w-full max-w-3xl flex-col">
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-lg bg-linear-to-br from-teal-400 to-emerald-600 font-mono text-xs font-bold text-white">
              t
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight text-white">tucaken</span>
            <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              {isProcessing ? 'Setting up…' : 'Get started'}
            </span>
          </div>
          {!isProcessing && (
            <OnboardingProgress
              steps={VISIBLE_STEPS}
              current={visibleIndex}
              onJump={s.jumpTo}
            />
          )}
        </header>

        <main className="flex-1">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-sm md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={s.stepId}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-120"
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
                  <ImportCareerStep onNext={s.next} onSkip={s.next} />
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

                {s.stepId === 'processing' && <ProcessingStep />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
