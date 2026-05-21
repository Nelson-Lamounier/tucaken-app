import { useState } from 'react'
import { ArrowTrendingUpIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid'
import type { ProfileSummary, DiagnosticJson, DiagnosticComponentScore } from '@/lib/types/profile.types'

type Tier = 'high' | 'mid' | 'low'

const tierOf = (score: number): Tier => (score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low')

// Component scores reuse the global tier palette. `chip` is the small score badge,
// `dot` the leading status indicator on each stat cell.
const TIER_STYLES: Readonly<Record<Tier, { chip: string; dot: string; text: string }>> = {
  high: {
    chip: 'bg-teal-400/10 text-teal-300 inset-ring inset-ring-teal-400/30',
    dot:  'bg-teal-400',
    text: 'text-teal-300',
  },
  mid: {
    chip: 'bg-amber-400/10 text-amber-300 inset-ring inset-ring-amber-400/30',
    dot:  'bg-amber-400',
    text: 'text-amber-300',
  },
  low: {
    chip: 'bg-rose-400/10 text-rose-300 inset-ring inset-ring-rose-400/30',
    dot:  'bg-rose-400',
    text: 'text-rose-300',
  },
}

const COMPONENT_LABEL: Readonly<Record<string, string>> = {
  profileDepth:            'Profile depth',
  ragDepth:                'RAG depth',
  directionConfidence:     'Direction',
  reconciliationAlignment: 'Reconciliation',
  resumeCoverage:          'Résumé coverage',
}

export function DiagnosticPanel({ summary }: { readonly summary: ProfileSummary }) {
  const d: DiagnosticJson | null = summary.diagnostic
  const [openKey, setOpenKey]    = useState<string | null>(null)
  const [showExplain, setShow]   = useState(false)

  if (!d) {
    return (
      <section className="overflow-hidden rounded-2xl bg-white/2 p-6 inset-ring inset-ring-white/10">
        <p className="text-sm text-zinc-500">Your readiness diagnostic is still being generated.</p>
      </section>
    )
  }

  const overallTier = tierOf(d.overall)
  const overallStyle = TIER_STYLES[overallTier]
  const entries = Object.entries(d.components) as Array<[string, DiagnosticComponentScore]>

  return (
    <section className="overflow-hidden rounded-2xl bg-white/2 inset-ring inset-ring-white/10">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={`flex items-baseline gap-0.5 rounded-xl px-3 py-2 ${overallStyle.chip}`}>
            <span className="text-3xl font-semibold tabular-nums">{d.overall}</span>
            <span className="text-xs font-normal opacity-60">/100</span>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Resume-Readiness</p>
            <p className="mt-0.5 text-sm font-medium text-zinc-100">
              {overallTier === 'high' && 'Strong — ready to ship'}
              {overallTier === 'mid'  && 'Solid foundation, room to improve'}
              {overallTier === 'low'  && 'Needs work before publishing'}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
          <ArrowTrendingUpIcon className="size-4" aria-hidden />
          Tap a metric for blockers
        </div>
      </header>

      {/* Component grid — hairline dividers via gap-px on tinted bg */}
      <dl className="grid grid-cols-1 gap-px bg-white/5 sm:grid-cols-2 lg:grid-cols-5">
        {entries.map(([key, comp]) => {
          const tier = tierOf(comp.score)
          const style = TIER_STYLES[tier]
          const isOpen = openKey === key
          const hasBlockers = comp.blockers.length > 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => setOpenKey(prev => (prev === key ? null : key))}
              aria-expanded={isOpen}
              className={`group relative flex flex-col items-start gap-2 bg-zinc-950/40 px-5 py-4 text-left transition-colors hover:bg-zinc-900/60 ${
                isOpen ? 'bg-zinc-900/80' : ''
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <dt className="text-xs font-medium text-zinc-400">
                  {COMPONENT_LABEL[key] ?? key}
                </dt>
                <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
              </div>
              <dd className="flex w-full items-baseline justify-between gap-2">
                <span className={`text-2xl font-semibold tabular-nums ${style.text}`}>
                  {comp.score}
                </span>
                {hasBlockers && (
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400">
                    {comp.blockers.length} issue{comp.blockers.length !== 1 ? 's' : ''}
                  </span>
                )}
              </dd>
              {/* progress bar */}
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full ${style.dot}`}
                  style={{ width: `${Math.max(2, Math.min(100, comp.score))}%` }}
                />
              </div>
            </button>
          )
        })}
      </dl>

      {/* Expanded blockers */}
      {openKey && (d.components[openKey]?.blockers.length ?? 0) > 0 && (
        <div className="border-t border-white/5 bg-zinc-950/40 px-6 py-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {COMPONENT_LABEL[openKey] ?? openKey} — blockers
          </p>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {d.components[openKey]!.blockers.map((b, i) => (
              <li key={`${openKey}-${i}`} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI explanation */}
      {d.explanation && (
        <div className="border-t border-white/5 bg-white/1.5">
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            aria-expanded={showExplain}
            className="flex w-full items-center justify-between gap-2 px-6 py-3 text-left text-xs text-zinc-500 transition-colors hover:bg-white/2"
          >
            <span className="inline-flex items-center gap-2">
              <span className="rounded-full bg-indigo-400/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300 inset-ring inset-ring-indigo-400/20">
                AI
              </span>
              {showExplain ? 'Hide analysis' : 'Show analysis'}
            </span>
            {showExplain
              ? <ChevronUpIcon className="size-4" aria-hidden />
              : <ChevronDownIcon className="size-4" aria-hidden />}
          </button>
          {showExplain && (
            <p className="px-6 pb-4 text-xs leading-relaxed text-zinc-400">{d.explanation}</p>
          )}
        </div>
      )}
    </section>
  )
}
