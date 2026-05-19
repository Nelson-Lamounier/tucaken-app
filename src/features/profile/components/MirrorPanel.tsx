import { useState } from 'react'
import { topLanguages, arcPoints } from '@/features/profile/lib/visual-band'
import type { ProfileSummary } from '@/lib/types/profile.types'

export function MirrorPanel({ summary }: { readonly summary: ProfileSummary }) {
  const [open, setOpen] = useState(false)
  const rollup = (summary.rollup as unknown) as {
    languages?: Parameters<typeof topLanguages>[0]
    domains?: { dominant: string | null; counts: Record<string, number> }
    totals?: { activeYearsApprox: number }
    activityArc?: Parameters<typeof arcPoints>[0]
  } | null
  const langs = topLanguages(rollup?.languages)
  const arc = arcPoints(rollup?.activityArc)
  const reveals = summary.reveal?.reveals ?? []

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-5">
      {summary.mirror?.paragraph
        ? <p className="text-sm leading-relaxed text-zinc-200">{summary.mirror.paragraph}</p>
        : <p className="text-sm text-zinc-500">Your profile summary is still being generated.</p>}

      <div className="flex flex-wrap gap-2">
        {langs.map(l => (
          <span key={l.language} className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {l.language} {Math.round(l.sharePct)}%
          </span>
        ))}
        {rollup?.domains?.dominant && (
          <span className="rounded border border-indigo-500/20 bg-indigo-500/8 px-1.5 py-0.5 text-[10px] text-indigo-300">
            {rollup.domains.dominant}
          </span>
        )}
        {rollup?.totals?.activeYearsApprox != null && (
          <span className="ml-auto text-[10px] text-zinc-500">
            ~{rollup.totals.activeYearsApprox} yrs active
          </span>
        )}
      </div>

      {arc.length > 0 && (
        <div className="flex items-center gap-1">
          {arc.map((p, i) => (
            <span key={i} title={`${p.date} · ${p.language ?? '—'} · ${p.domain}`}
              className="h-1.5 w-3 rounded-sm bg-teal-500/40" />
          ))}
        </div>
      )}

      {reveals.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen(o => !o)}
            className="text-xs text-teal-400 hover:text-teal-300">
            {open ? 'Hide' : `Show ${reveals.length} things we noticed`}
          </button>
          {open && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-300">
              {reveals.map((r, i) => (
                <li key={i}>{r.insight} <span className="text-zinc-500">({r.evidence})</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
