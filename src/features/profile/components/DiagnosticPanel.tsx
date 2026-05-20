import { useState } from 'react'
import type { ProfileSummary, DiagnosticJson, DiagnosticComponentScore } from '@/lib/types/profile.types'

const TIER = (score: number): string =>
  score >= 70 ? 'border-teal-500/30 bg-teal-500/10 text-teal-300'
: score >= 40 ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
:               'border-red-500/30 bg-red-500/10 text-red-300'

const COMPONENT_LABEL: Readonly<Record<string, string>> = {
  profileDepth:            'Profile depth',
  ragDepth:                'RAG depth',
  directionConfidence:     'Direction',
  reconciliationAlignment: 'Reconciliation',
  resumeCoverage:          'Résumé coverage',
}

export function DiagnosticPanel({ summary }: { readonly summary: ProfileSummary }) {
  const d: DiagnosticJson | null = summary.diagnostic
  const [openKey, setOpenKey] = useState<string | null>(null)
  if (!d) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/2 p-5">
        <p className="text-sm text-zinc-500">Your readiness diagnostic is still being generated.</p>
      </section>
    )
  }
  const entries = Object.entries(d.components) as Array<[string, DiagnosticComponentScore]>
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-5">
      <div className="flex items-baseline gap-3">
        <span className={`rounded-lg border px-2.5 py-1 text-lg font-semibold ${TIER(d.overall)}`}>
          {d.overall}<span className="text-xs text-zinc-500">/100</span>
        </span>
        <span className="text-xs uppercase tracking-wide text-zinc-500">Resume-Readiness</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, comp], i) => (
          <button key={`${key}-${i}`} type="button"
            onClick={() => setOpenKey(o => o === key ? null : key)}
            className={`rounded border px-1.5 py-0.5 text-[10px] ${TIER(comp.score)}`}
            aria-expanded={openKey === key}
            title={COMPONENT_LABEL[key] ?? key}>
            {COMPONENT_LABEL[key] ?? key} · {comp.score}
          </button>
        ))}
      </div>
      {openKey && (d.components[openKey]?.blockers.length ?? 0) > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-300">
          {d.components[openKey]!.blockers.map((b, i) => (<li key={`${openKey}-${i}`}>{b}</li>))}
        </ul>
      )}
      {d.explanation && (
        <p className="text-xs italic text-zinc-400">
          <span className="not-italic text-zinc-500">AI-generated:</span> {d.explanation}
        </p>
      )}
    </section>
  )
}
