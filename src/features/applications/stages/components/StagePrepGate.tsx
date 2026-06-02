'use client'

import type { ReactNode } from 'react'
import type { InterviewStage, StageState } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface StagePrepGateProps {
  readonly stage: InterviewStage
  readonly state: StageState | undefined
  readonly stageLabel: string
  readonly onSchedule: () => void
  readonly onAdvance: () => void
  readonly onGenerate: () => void
  /** The real workspace — rendered only when prep is ready. */
  readonly children: ReactNode
}

/**
 * State-machine gate that guards non-Applied stage workspaces.
 *
 * Branch priority (matches backend lifecycle):
 *   not_applicable → muted notice
 *   prep = queued   → generating notice
 *   prep = failed   → error + retry CTA
 *   prep = ready    → render children (the real workspace)
 *   prep = none + stage = completed → retroactive generate CTA
 *   prep = none + stage = upcoming/current → teaser with schedule + advance CTAs
 */
export function StagePrepGate({
  state,
  stageLabel,
  onSchedule,
  onAdvance,
  onGenerate,
  children,
}: StagePrepGateProps) {
  const prep = state?.prep_status ?? 'none'
  const lifecycle = state?.stage_status ?? 'upcoming'

  if (lifecycle === 'not_applicable') {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {stageLabel} is marked not applicable — no prep generated.
      </p>
    )
  }

  if (prep === 'queued') {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-2 animate-pulse rounded-full bg-amber-400 dark:bg-amber-300" aria-hidden />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Generating your {stageLabel} prep… this takes a minute or two.
          </p>
        </div>
      </Card>
    )
  }

  if (prep === 'failed') {
    return (
      <Card className="p-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Prep generation failed.</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Something went wrong generating your {stageLabel} prep. You can retry below.
          </p>
          <Button variant="warning" onClick={onGenerate}>
            Retry
          </Button>
        </div>
      </Card>
    )
  }

  if (prep === 'ready') {
    return <>{children}</>
  }

  // prep === 'none'
  if (lifecycle === 'completed') {
    return (
      <Card className="p-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            This stage is complete.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No prep was generated for the {stageLabel} stage.
          </p>
          <Button variant="ghost" onClick={onGenerate}>
            Generate prep anyway
          </Button>
        </div>
      </Card>
    )
  }

  // prep === 'none', lifecycle === 'upcoming' | 'current'
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {stageLabel} prep
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Generate tailored prep when you reach this stage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onSchedule}>
            Schedule {stageLabel.toLowerCase()}
          </Button>
          <Button variant="primary" onClick={onAdvance}>
            Advance to {stageLabel}
          </Button>
        </div>
      </div>
    </Card>
  )
}
