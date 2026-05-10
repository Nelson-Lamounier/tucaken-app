// src/features/onboarding/components/OnboardingShell.tsx
//
// Top-level container for the first-run onboarding wizard.
// Variant B from the canvas — teal accent, top stepper, centered modal,
// slide transitions, warm tone.

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { OnboardingBackground } from './OnboardingBackground'
import { OnboardingProgress } from './OnboardingProgress'
import { WelcomeStep } from './WelcomeStep'
import { PortfolioStep } from './PortfolioStep'
import { ImportCareerStep } from '../steps/ImportCareerStep'
import { ConnectStep } from './ConnectStep'
import { useOnboardingState } from './useOnboardingState'
import type { OnboardingShellProps } from './types'

const VISIBLE_STEPS = [
  { id: 'welcome'   as const, name: 'Welcome' },
  { id: 'portfolio' as const, name: 'Portfolio' },
  { id: 'resume'    as const, name: 'Resume' },
  { id: 'connect'   as const, name: 'Connect' },
]

export function OnboardingShell({
  onSubmitPortfolio,
  onConnectGithub,
  onComplete,
  installation,
  isLoadingInstallation,
  initialStepIndex = 0,
}: Readonly<OnboardingShellProps>) {
  const s = useOnboardingState(initialStepIndex)

  // Step 5 ("done") is a one-frame state — we run onComplete and let the
  // parent route navigate away.
  useEffect(() => {
    if (s.stepId !== 'done') return
    void Promise.resolve(onComplete?.())
  }, [s.stepId, onComplete])

  // Shell transitions: slide horizontally between steps.
  const direction = 1 // forward-only (no back-slide), keeps it simple
  const variants = {
    enter:  { opacity: 0, x: 20 * direction },
    center: { opacity: 1, x: 0 },
    exit:   { opacity: 0, x: -20 * direction },
  }

  async function handlePortfolioSubmit(url: string) {
    s.setPortfolioUrl(url)
    await onSubmitPortfolio?.(url)
  }

  function handleConnectGithub() {
    onConnectGithub?.()
  }

  const visibleIndex = Math.min(s.stepIndex, VISIBLE_STEPS.length - 1)

  return (
    <div className="dark relative flex min-h-screen w-full items-stretch justify-center overflow-hidden bg-zinc-950 px-4 py-8 text-zinc-200">
      <OnboardingBackground />

      <div className="relative flex w-full max-w-3xl flex-col">
        {/* Brand + progress header */}
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 font-mono text-xs font-bold text-white">
              t
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight text-white">tucaken</span>
            <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              Get started
            </span>
          </div>
          <OnboardingProgress
            steps={VISIBLE_STEPS}
            current={visibleIndex}
            onJump={s.jumpTo}
          />
        </header>

        {/* Step body — centered modal card with slide transitions */}
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
                className="min-h-[480px]"
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

                {s.stepId === 'done' && (
                  <div className="flex h-[480px] items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-4 size-10 animate-pulse rounded-full bg-teal-500/20 ring-1 ring-teal-400/30" />
                      <div className="text-sm text-zinc-400">Taking you to your dashboard…</div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
