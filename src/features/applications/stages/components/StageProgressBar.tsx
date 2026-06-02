'use client'

import { Check } from 'lucide-react'
import { motion, MotionConfig } from 'motion/react'
import type { InterviewStage, StageState } from '@/lib/types/applications.types'
import { STAGE_LABELS } from '../../components/ApplicationTypes'
import { STAGE_ORDER, stageProgress } from '../types/stage'

interface StageProgressBarProps {
  /** The application's real interview stage (Current Stage). */
  readonly current: InterviewStage
  /** The stage the user is viewing (Active Stage). */
  readonly active: InterviewStage
  readonly onSelect: (stage: InterviewStage) => void
  /**
   * Per-stage lifecycle state from the backend. When provided and a stage has a
   * row, the segment's display is derived from `stage_status` rather than index
   * math. Falls back to `stageProgress(stage, current)` when absent or when the
   * stage has no row.
   */
  readonly stages?: Record<string, StageState>
}

/** Maps backend stage_status to the display tuple used by StageDot. */
function resolveSegment(
  stage: InterviewStage,
  current: InterviewStage,
  stages: Record<string, StageState> | undefined,
): { completed: boolean; isCurrent: boolean; notApplicable: boolean; queued: boolean } {
  const row = stages?.[stage]
  if (row) {
    return {
      completed: row.stage_status === 'completed',
      isCurrent: row.stage_status === 'current',
      notApplicable: row.stage_status === 'not_applicable',
      queued: row.prep_status === 'queued',
    }
  }
  // Fallback: derive from index math
  const progress = stageProgress(stage, current)
  return {
    completed: progress === 'completed',
    isCurrent: progress === 'current',
    notApplicable: false,
    queued: false,
  }
}

/**
 * Horizontal seven-segment stage navigator. Each segment is a Current-Stage
 * derived state (completed / current / upcoming) and an Active-Stage selection
 * highlight (the sliding `layoutId` pill). Scrolls horizontally on mobile.
 *
 * When `stages` is provided, per-stage lifecycle state from the backend drives
 * the segment display (completed / current / not_applicable); a queued
 * prep_status adds a pulsing "Generating…" affordance.
 */
export function StageProgressBar({ current, active, onSelect, stages }: StageProgressBarProps) {
  return (
    <MotionConfig transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <div
        role="tablist"
        aria-label="Interview stages"
        className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-white/2"
      >
        {STAGE_ORDER.map(stage => {
          const { completed, isCurrent, notApplicable, queued } = resolveSegment(stage, current, stages)
          const isActive = stage === active

          return (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={
                notApplicable
                  ? `${STAGE_LABELS[stage]} (not applicable)`
                  : queued
                    ? `${STAGE_LABELS[stage]} — generating prep`
                    : STAGE_LABELS[stage]
              }
              onClick={() => onSelect(stage)}
              className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 ${
                notApplicable
                  ? isActive
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400'
                  : isActive
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
                <StageDot completed={completed} current={isCurrent} notApplicable={notApplicable} />
                {STAGE_LABELS[stage]}
                {queued && (
                  <span
                    aria-label="Generating prep"
                    className="inline-flex size-1.5 animate-pulse rounded-full bg-amber-400 dark:bg-amber-300"
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </MotionConfig>
  )
}

function StageDot({
  completed,
  current,
  notApplicable,
}: {
  readonly completed: boolean
  readonly current: boolean
  readonly notApplicable: boolean
}) {
  if (notApplicable) {
    return (
      <span
        className="size-4 rounded-full border border-dashed border-zinc-300 dark:border-zinc-600"
        aria-hidden
      />
    )
  }
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
