'use client'

import { Card } from '@/components/ui/Card'
import { SummaryGroup } from '@/features/applications/stages/components/workspace-shell/SummaryGroup'
import type { FunnelBand, FunnelTransition } from '@/lib/types/applications.types'

interface FunnelViewProps {
  readonly transitions: readonly FunnelTransition[]
}

/** Band → human label + token classes. above=positive, typical=neutral, below=attention. */
const BAND_STYLES: Record<FunnelBand, { label: string; className: string }> = {
  above: {
    label: 'Above range',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  typical: {
    label: 'Typical',
    className: 'bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-300',
  },
  below: {
    label: 'Needs attention',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  },
}

/** Format a 0–1 rate as a whole-number percentage string. */
function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** The coloured band pill for a transition. */
function BandPill({ band }: { readonly band: FunnelBand }) {
  const { label, className } = BAND_STYLES[band]
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  )
}

/** The rate figure + its from→to counts. */
function RateBlock({ transition }: { readonly transition: FunnelTransition }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        data-funnel-rate
        className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
      >
        {formatRate(transition.rate)}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {transition.toCount} of {transition.fromCount}
      </span>
    </div>
  )
}

/**
 * One transition row. The rate and the honest `context` qualifier are rendered
 * together inside the same card — a rate is never shown without its context.
 */
function TransitionRow({ transition }: { readonly transition: FunnelTransition }) {
  return (
    <div data-funnel-transition={transition.key}>
      <Card className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <RateBlock transition={transition} />
          <BandPill band={transition.band} />
        </div>
        <p data-funnel-context className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {transition.context}
        </p>
      </Card>
    </div>
  )
}

/**
 * The stage funnel. Each transition renders its rate, a band-coloured pill, and
 * the honest range-context qualifier. No bare rates, no cohort ranking.
 */
export function FunnelView({ transitions }: FunnelViewProps) {
  return (
    <SummaryGroup
      id="funnel"
      title="Stage funnel"
      subtitle="Each rate is shown with the honest range it sits in."
      count={transitions.length}
    >
      {transitions.length === 0 ? (
        <Card className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
          Funnel rates appear once you have applications moving through stages.
        </Card>
      ) : (
        <div className="space-y-2.5">
          {transitions.map(transition => (
            <TransitionRow key={transition.key} transition={transition} />
          ))}
        </div>
      )}
    </SummaryGroup>
  )
}
