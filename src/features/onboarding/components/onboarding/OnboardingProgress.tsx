// src/features/onboarding/components/OnboardingProgress.tsx
//
// Minimal stepper: no labels, no numbers — just the "continuum" line.
// A cumulative teal line fills through every completed step up to (and
// including) the active one. scaleX (origin-left) → GPU-composited.

import { motion } from 'motion/react'

interface Props {
  /**
   * Ordered visible steps. Ids are display-only (the continuum renders no
   * labels), so they need not be machine StepIds — the GitHub/Repositories
   * phases of the merged `connect` step appear here as separate segments.
   */
  steps: Array<{ id: string; name: string }>
  /** Index of the currently-active step within `steps`. */
  current: number
}

// Duration-based spring (per Motion transitions docs): easy to coordinate,
// low bounce for a product UI.
const CONTINUUM = {
  type: 'spring' as const,
  visualDuration: 0.45,
  bounce: 0.18,
}

export function OnboardingProgress({ steps, current }: Readonly<Props>) {
  // Fill reaches the right edge of the active step → covers all previous
  // steps + the active one.
  const progress = (current + 1) / steps.length

  return (
    <nav
      aria-label={`Progress: step ${current + 1} of ${steps.length}`}
      className="w-full"
    >
      <div className="relative h-0.75 w-full">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-white/10"
        />
        <motion.span
          aria-hidden
          className="absolute inset-0 origin-left rounded-full bg-teal-400 shadow-[0_0_12px_2px_rgba(45,212,191,0.55)]"
          style={{ willChange: 'transform' }}
          initial={false}
          animate={{ scaleX: progress }}
          transition={CONTINUUM}
        />
      </div>
    </nav>
  )
}
