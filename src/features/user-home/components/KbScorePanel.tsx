'use client'

import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { DiagnosticJson } from '@/lib/types/profile.types'
import { tierOf, TIER_TEXT } from '../lib/tier'
import type { Tier } from '../lib/tier'
import { ReadinessGauge } from './ReadinessGauge'
import { KbReadinessPanel } from './KbReadinessPanel'

const TIER_PILL: Readonly<Record<Tier, { glow: string; label: string }>> = {
  high: { glow: 'bg-teal-500/10 dark:bg-teal-400/10 inset-ring-teal-500/30 dark:inset-ring-teal-400/30',  label: 'Strong — ready to ship' },
  mid:  { glow: 'bg-amber-500/10 dark:bg-amber-400/10 inset-ring-amber-500/30 dark:inset-ring-amber-400/30', label: 'Solid foundation, room to improve' },
  low:  { glow: 'bg-rose-500/10 dark:bg-rose-400/10 inset-ring-rose-500/30 dark:inset-ring-rose-400/30',  label: 'Needs work before publishing' },
}

const PILL_TEXT: Readonly<Record<Tier, string>> = { high: 'Strong', mid: 'On track', low: 'Needs work' }

/** Hover/focus-reveal popover holding the AI explanation, so it doesn't take
 *  permanent vertical space. CSS-driven (opacity/visibility) — no JS state. */
function AiAnalysis({ explanation }: { readonly explanation: string }) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="Show AI analysis"
        className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 inset-ring inset-ring-indigo-600/10 dark:bg-indigo-400/10 dark:text-indigo-300 dark:inset-ring-indigo-400/20"
      >
        <Sparkles className="size-3" /> AI analysis
      </button>
      <div
        role="tooltip"
        className="invisible absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 opacity-0 shadow-lg transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {explanation}
      </div>
    </div>
  )
}

export function KbScorePanel({
  diagnostic,
  isLoading,
}: {
  readonly diagnostic: DiagnosticJson | null
  readonly isLoading: boolean
}) {
  if (!diagnostic) {
    return (
      <Card as="section" className="flex h-full flex-col overflow-hidden p-6 sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Resume-Readiness</p>
        <p className="mt-4 text-sm text-zinc-500">
          {isLoading ? 'Calculating your readiness…' : 'Your readiness diagnostic is still being generated.'}
        </p>
      </Card>
    )
  }

  const tier = tierOf(diagnostic.overall)

  return (
    <Card as="section" className="flex h-full flex-col overflow-hidden p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Resume-Readiness</p>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium inset-ring ${TIER_PILL[tier].glow} ${TIER_TEXT[tier]}`}>
            {PILL_TEXT[tier]}
          </span>
          {diagnostic.explanation && <AiAnalysis explanation={diagnostic.explanation} />}
        </div>
      </div>

      <ReadinessGauge value={diagnostic.overall} />

      <p className="text-center text-sm font-medium text-zinc-700 dark:text-zinc-300">{TIER_PILL[tier].label}</p>

      {/* At-a-glance signal breakdown, compact, where the analysis used to sit */}
      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-white/5">
        <KbReadinessPanel diagnostic={diagnostic} embedded />
      </div>
    </Card>
  )
}
