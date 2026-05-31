'use client'

import { Check } from 'lucide-react'
import { motion, MotionConfig } from 'motion/react'
import type { InterviewStage } from '@/lib/types/applications.types'
import { STAGE_LABELS } from '../../components/ApplicationTypes'
import { STAGE_ORDER, stageProgress } from '../types/stage'

interface StageProgressBarProps {
  /** The application's real interview stage (Current Stage). */
  readonly current: InterviewStage
  /** The stage the user is viewing (Active Stage). */
  readonly active: InterviewStage
  readonly onSelect: (stage: InterviewStage) => void
}

/**
 * Horizontal seven-segment stage navigator. Each segment is a Current-Stage
 * derived state (completed / current / upcoming) and an Active-Stage selection
 * highlight (the sliding `layoutId` pill). Scrolls horizontally on mobile.
 */
export function StageProgressBar({ current, active, onSelect }: StageProgressBarProps) {
  return (
    <MotionConfig transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <div
        role="tablist"
        aria-label="Interview stages"
        className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-white/2"
      >
        {STAGE_ORDER.map(stage => {
          const progress = stageProgress(stage, current)
          const isActive = stage === active
          const isCompleted = progress === 'completed'
          const isCurrent = progress === 'current'

          return (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(stage)}
              className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 ${
                isActive
                  ? 'text-accent'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="stage-active-pill"
                  className="absolute inset-0 rounded-lg bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] inset-ring inset-ring-[color-mix(in_oklab,var(--accent)_28%,transparent)]"
                  style={{ willChange: 'transform' }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <StageDot completed={isCompleted} current={isCurrent} />
                {STAGE_LABELS[stage]}
              </span>
            </button>
          )
        })}
      </div>
    </MotionConfig>
  )
}

function StageDot({ completed, current }: { readonly completed: boolean; readonly current: boolean }) {
  if (completed) {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 dark:bg-emerald-400">
        <Check className="size-2.5 text-white" aria-hidden />
      </span>
    )
  }
  if (current) {
    return <span className="size-4 rounded-full bg-(--accent) ring-2 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]" aria-hidden />
  }
  return <span className="size-4 rounded-full border border-zinc-300 dark:border-zinc-600" aria-hidden />
}
