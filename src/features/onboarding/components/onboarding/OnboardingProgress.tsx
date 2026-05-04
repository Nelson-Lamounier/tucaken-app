// src/features/onboarding/components/OnboardingProgress.tsx
//
// Top stepper for desktop; collapses to a dot indicator on mobile.
// Variant B from the canvas — teal accent, clean, horizontal.

import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import type { StepId } from './types'

interface Props {
  /** Ordered step ids (welcome → connect, the public-facing 4 steps). */
  steps: Array<{ id: StepId; name: string }>
  /** Index of the currently-active step within `steps`. */
  current: number
  /** Optional: clicking a completed step jumps back to it. */
  onJump?: (id: StepId) => void
}

export function OnboardingProgress({ steps, current, onJump }: Props) {
  return (
    <>
      {/* Desktop · top stepper */}
      <nav aria-label="Progress" className="hidden w-full md:block">
        <ol className="flex items-center gap-3">
          {steps.map((step, i) => {
            const isDone = i < current
            const isActive = i === current
            return (
              <li key={step.id} className="flex flex-1 items-center gap-3">
                <button
                  type="button"
                  onClick={isDone && onJump ? () => onJump(step.id) : undefined}
                  disabled={!isDone}
                  className={[
                    'flex flex-1 items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition',
                    isActive
                      ? 'border-teal-400/40 bg-teal-500/10 text-teal-100'
                      : isDone
                        ? 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20 cursor-pointer'
                        : 'border-white/5 bg-transparent text-zinc-500 cursor-default',
                  ].join(' ')}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span
                    className={[
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                      isActive
                        ? 'bg-teal-400 text-zinc-950'
                        : isDone
                          ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-400/40'
                          : 'bg-white/5 text-zinc-500 ring-1 ring-white/10',
                    ].join(' ')}
                  >
                    {isDone ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
                  </span>
                  <span className="text-xs font-medium">{step.name}</span>
                  {isActive && (
                    <motion.span
                      layoutId="onboarding-progress-active"
                      className="ml-auto h-1 w-6 rounded-full bg-teal-400"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Mobile · dot indicator */}
      <nav aria-label="Progress" className="flex items-center justify-center gap-2.5 md:hidden">
        {steps.map((step, i) => {
          const isActive = i === current
          const isDone = i < current
          return (
            <span
              key={step.id}
              aria-current={isActive ? 'step' : undefined}
              aria-label={step.name}
              className={[
                'h-1.5 rounded-full transition-all duration-300',
                isActive ? 'w-6 bg-teal-400' : isDone ? 'w-1.5 bg-teal-500/50' : 'w-1.5 bg-white/15',
              ].join(' ')}
            />
          )
        })}
        <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          {current + 1}/{steps.length}
        </span>
      </nav>
    </>
  )
}
