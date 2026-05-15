import { useState } from 'react'
import {
  Check,
  Minus,
  ChevronDown,
  Sparkles,
  Target,
  Hash,
  TriangleAlert,
} from 'lucide-react'
import type { GapAnalysisReport as Report, PerRoleGap } from '@/server/resume-imports'

interface GapAnalysisReportProps {
  readonly report: Report | null
}

/** Hue shifts green→amber→rose as the score drops. Pure CSS via conic-gradient. */
function scoreColor(score: number): string {
  if (score >= 75) return '#34d399' // emerald-400
  if (score >= 50) return '#fbbf24' // amber-400
  return '#fb7185'                   // rose-400
}

function ScoreDial({ score }: { readonly score: number }) {
  const c = scoreColor(score)
  return (
    <div
      className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${c} ${score * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
      }}
    >
      <div className="grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full bg-zinc-950">
        <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-100">
          {score}
        </span>
        <span className="text-[0.6rem] uppercase tracking-[0.2em] text-zinc-500">score</span>
      </div>
    </div>
  )
}

function RoleGapCard({ role, index }: { readonly role: PerRoleGap; readonly index: number }) {
  const [open, setOpen] = useState(index === 0)
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] opacity-0 [animation:gap-rise_0.5s_ease-out_forwards]"
      style={{ animationDelay: `${120 + index * 70}ms` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] font-mono text-xs tabular-nums text-zinc-400">
          {role.completenessScore}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-200">
            {role.title} <span className="text-zinc-500">· {role.company}</span>
          </p>
          <p className="truncate text-xs text-zinc-600">{role.period}</p>
        </div>
        {role.externalValidation === 'limited' && (
          <span
            title="Limited external validation — based on your bullets and general role knowledge"
            className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-amber-300"
          >
            <TriangleAlert className="h-3 w-3" />
            limited
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/[0.06] px-4 py-4">
          {role.coveredResponsibilities.length > 0 && (
            <div>
              <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-emerald-400/80">
                Covered
              </p>
              <ul className="space-y-1">
                {role.coveredResponsibilities.map((r) => (
                  <li key={r} className="flex gap-2 text-xs text-zinc-400">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {role.missingResponsibilities.length > 0 && (
            <div>
              <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-rose-400/80">
                Missing
              </p>
              <ul className="space-y-1">
                {role.missingResponsibilities.map((r) => (
                  <li key={r} className="flex gap-2 text-xs text-zinc-400">
                    <Minus className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {role.suggestedAdditions.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-wider text-indigo-300/80">
                <Sparkles className="h-3 w-3" /> Suggested additions
              </p>
              <ul className="space-y-2">
                {role.suggestedAdditions.map((s) => (
                  <li key={s.bullet} className="rounded-lg border border-indigo-500/15 bg-indigo-500/[0.06] p-2.5">
                    <p className="text-xs text-zinc-200">{s.bullet}</p>
                    <p className="mt-1 text-[0.7rem] italic text-zinc-500">{s.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {role.quantificationOpportunities.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-wider text-zinc-400">
                <Target className="h-3 w-3" /> Add metrics to
              </p>
              <ul className="space-y-1">
                {role.quantificationOpportunities.map((q) => (
                  <li key={q} className="text-xs text-zinc-500">— {q}</li>
                ))}
              </ul>
            </div>
          )}

          {role.keywordsForATS.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {role.keywordsForATS.map((k) => (
                <span
                  key={k}
                  className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-[0.7rem] text-zinc-400"
                >
                  <Hash className="h-2.5 w-2.5 text-zinc-600" />
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Phase-1 hero artifact. Renders the gap-analysis report above the editable
 * career entries on the review screen. Null-safe: gap analysis is non-fatal
 * upstream, so absence renders nothing and the review screen is unaffected.
 */
export function GapAnalysisReport({ report }: GapAnalysisReportProps) {
  if (!report) return null

  const { skillsGap, freeTierLimit } = report

  return (
    <div className="space-y-5">
      <style>{`@keyframes gap-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* Header: dial + narrative */}
      <div className="flex items-start gap-5 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5">
        <ScoreDial score={report.overallScore} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-100">Resume gap analysis</h3>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-400">
            {report.narrativeFeedback}
          </p>
        </div>
      </div>

      {/* Skills gap — three semantic columns. Static class strings: Tailwind
          JIT can't see interpolated class names, so each is spelled out. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ['Present',  skillsGap.present,  'text-emerald-400/80'],
          ['Missing',  skillsGap.missing,  'text-rose-400/80'],
          ['Emerging', skillsGap.emerging, 'text-indigo-400/80'],
        ] as const).map(([label, items, hueClass]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
            <p className={`mb-2 text-[0.7rem] font-semibold uppercase tracking-wider ${hueClass}`}>
              {label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.length === 0 && <span className="text-xs text-zinc-600">—</span>}
              {items.map((s) => (
                <span key={s} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-xs text-zinc-400">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Per-role cards */}
      <div className="space-y-2.5">
        {report.perRole.map((role, i) => (
          <RoleGapCard key={role.roleId} role={role} index={i} />
        ))}
      </div>

      {freeTierLimit.rolesSkipped > 0 && freeTierLimit.upgradeCta && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200/90">
          {freeTierLimit.upgradeCta}
        </div>
      )}
    </div>
  )
}
