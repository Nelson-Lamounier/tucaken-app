import { useState } from 'react'
import type { ProfileSummary } from '@/lib/types/profile.types'

const TIER = {
  strong:   'border-teal-500/30 bg-teal-500/10 text-teal-300',
  moderate: 'border-amber-500/20 bg-amber-500/8 text-amber-300',
  weak:     'border-white/10 bg-white/5 text-zinc-500',
} as const

export function DirectionPanel({ summary }: { readonly summary: ProfileSummary }) {
  const [open, setOpen] = useState(false)
  const d = summary.direction
  if (!d) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/2 p-5">
        <p className="text-sm text-zinc-500">Your direction is still being generated.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-5">
      <div className="flex flex-wrap gap-2">
        {d.archetypes.map((a, i) => (
          <span key={`${a.archetype}-${i}`} title={a.rationale}
            className={`rounded border px-1.5 py-0.5 text-[10px] ${TIER[a.fit] ?? TIER.weak}`}>
            {a.archetype} · {a.fit}
          </span>
        ))}
      </div>
      {d.seniority.length > 0 && (
        <ul className="space-y-1 text-xs text-zinc-300">
          {d.seniority.map((s, i) => (
            <li key={i}><span className="text-zinc-100">{s.area}</span> — {s.level}
              <span className="text-zinc-500"> ({s.evidence})</span></li>
          ))}
        </ul>
      )}
      {d.whatToDeepen.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen(o => !o)}
            className="text-xs text-teal-400 hover:text-teal-300">
            {open ? 'Hide' : `What to deepen (${d.whatToDeepen.length})`}
          </button>
          {open && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-300">
              {d.whatToDeepen.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
