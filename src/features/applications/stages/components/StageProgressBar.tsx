'use client'

import { Fragment } from 'react'
import { Check } from 'lucide-react'
import type { InterviewStage, StageState } from '@/lib/types/applications.types'
import { STAGE_LABELS } from '../../components/ApplicationTypes'
import { STAGE_ORDER, stageProgress } from '../types/stage'

interface StageProgressBarProps {
  /** The application's real interview stage (Current Stage). */
  readonly current: InterviewStage
  /** The stage the user is viewing (Active Stage). */
  readonly active: InterviewStage
  readonly onSelect: (stage: InterviewStage) => void
  /** Stages this viewer may open. Stages not in the set render disabled with a "Soon" cue. */
  readonly enabledStages: ReadonlySet<InterviewStage>
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
 * Pipeline connector fill: solid accent for segments before the active node, a
 * left→right gradient flowing into the active node, muted track after it.
 */
function connectorClass(idx: number, activeIndex: number): string {
  if (idx < activeIndex) return 'bg-[color-mix(in_oklab,var(--accent)_45%,transparent)]'
  if (idx === activeIndex) {
    return 'bg-gradient-to-r from-[color-mix(in_oklab,var(--accent)_10%,transparent)] to-[var(--accent)]'
  }
  return 'bg-zinc-200 dark:bg-white/10'
}

/** Node text colour — extracted to avoid a nested ternary in JSX. */
function nodeTextClass(notApplicable: boolean, isActive: boolean): string {
  if (notApplicable) {
    return isActive
      ? 'text-zinc-400 dark:text-zinc-500'
      : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400'
  }
  return isActive
    ? 'text-accent'
    : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
}

function nodeAriaLabel(stage: InterviewStage, notApplicable: boolean, queued: boolean): string {
  if (notApplicable) return `${STAGE_LABELS[stage]} (not applicable)`
  if (queued) return `${STAGE_LABELS[stage]} — generating prep`
  return STAGE_LABELS[stage]
}

/**
 * Horizontal seven-stage pipeline navigator. Each stage is a node (dot + label)
 * connected by a track; the track fills with an accent gradient up to the
 * Active stage, so the row reads like a progress pipeline. Node dots still
 * reflect Current-Stage lifecycle (completed / current / not-applicable), and
 * the active node carries an accent halo. Scrolls horizontally on mobile.
 */
export function StageProgressBar({ current, active, onSelect, enabledStages, stages }: StageProgressBarProps) {
  const activeIndex = STAGE_ORDER.indexOf(active)

  return (
    <div role="tablist" aria-label="Interview stages" className="flex items-start overflow-x-auto">
      {STAGE_ORDER.map((stage, idx) => {
        const { completed, isCurrent, notApplicable, queued } = resolveSegment(stage, current, stages)
        const isActive = stage === active
        const isEnabled = enabledStages.has(stage)

        return (
          <Fragment key={stage}>
            {idx > 0 && (
              <span
                aria-hidden
                className={`mt-2 h-0.5 min-w-8 flex-1 rounded-full transition-colors ${connectorClass(idx, activeIndex)}`}
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={nodeAriaLabel(stage, notApplicable, queued)}
              disabled={!isEnabled}
              title={isEnabled ? undefined : 'Coming soon — available after launch'}
              onClick={() => { if (isEnabled) onSelect(stage) }}
              className={`group relative flex shrink-0 flex-col items-center gap-2 whitespace-nowrap rounded-md px-2 pb-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 ${nodeTextClass(notApplicable, isActive)} ${isEnabled ? '' : 'cursor-not-allowed opacity-60'}`}
            >
              <span
                className={
                  isActive && !notApplicable
                    ? 'rounded-full ring-2 ring-offset-0 ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]'
                    : undefined
                }
              >
                <StageDot completed={completed} current={isCurrent} notApplicable={notApplicable} />
              </span>
              <span className="flex items-center gap-1.5">
                {STAGE_LABELS[stage]}
                {queued && (
                  <span
                    aria-label="Generating prep"
                    className="inline-flex size-1.5 animate-pulse rounded-full bg-amber-400 dark:bg-amber-300"
                  />
                )}
              </span>
              {!isEnabled && (
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  Soon
                </span>
              )}
            </button>
          </Fragment>
        )
      })}
    </div>
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
