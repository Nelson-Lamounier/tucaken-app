import { Target, CheckCircle2, XCircle } from 'lucide-react'
import type { EvidenceFit } from '@/lib/types/applications.types'

/** Shared glance-card surface — matches StageGlancePanel's SURFACE. */
const SURFACE =
  'rounded-md bg-white p-5 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none'

/**
 * Free-tier role-fit panel — renders the deterministic evidence-fit score
 * (`detail.analysis.evidenceFit`): what fraction of the JD's required/preferred
 * skills the candidate has evidence for, with the covered/missing breakdown.
 *
 * This is the free-tier substitute for the paid skill-coverage donut (which is
 * driven by the LLM matcher's verified/partial/gap verdicts). It is honest
 * binary keyword evidence — NOT a recruiter verdict — so the copy says so.
 */

const pct = (n: number): number => Math.round(n * 100)

/** Tone bucket for the headline score — green strong, amber moderate, red weak. */
function scoreTone(rate: number): { ring: string; text: string; bar: string } {
  if (rate >= 0.7) {
    return {
      ring: 'text-emerald-600 dark:text-emerald-400',
      text: 'text-emerald-700 dark:text-emerald-400',
      bar: 'bg-emerald-500 dark:bg-emerald-400',
    }
  }
  if (rate >= 0.4) {
    return {
      ring: 'text-amber-600 dark:text-amber-400',
      text: 'text-amber-700 dark:text-amber-400',
      bar: 'bg-amber-500 dark:bg-amber-400',
    }
  }
  return {
    ring: 'text-red-600 dark:text-red-400',
    text: 'text-red-700 dark:text-red-400',
    bar: 'bg-red-500 dark:bg-red-400',
  }
}

function SkillChip({ term, covered }: { readonly term: string; readonly covered: boolean }) {
  const cls = covered
    ? 'border border-transparent bg-teal-600/15 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300'
    : 'border border-red-300 text-red-600 dark:border-red-500/30 dark:text-red-400'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${cls}`}>
      {covered ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {term}
    </span>
  )
}

function SkillGroup({
  label,
  covered,
  missing,
  rate,
}: {
  readonly label: string
  readonly covered: readonly string[]
  readonly missing: readonly string[]
  readonly rate: number
}) {
  const total = covered.length + missing.length
  if (total === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label} · {covered.length}/{total} ({pct(rate)}%)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {covered.map((t) => (
          <SkillChip key={`c-${t}`} term={t} covered />
        ))}
        {missing.map((t) => (
          <SkillChip key={`m-${t}`} term={t} covered={false} />
        ))}
      </div>
    </div>
  )
}

export function FitScorePanel({ fit }: { readonly fit: EvidenceFit }) {
  const overall = pct(fit.overallFit)
  const tone = scoreTone(fit.overallFit)

  return (
    <section className={`space-y-4 ${SURFACE}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className={`size-5 ${tone.ring}`} />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Role fit</h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Evidence coverage</span>
        </div>
      </div>

      {/* Headline score + meter */}
      <div className="flex items-end gap-3">
        <span className={`text-4xl font-semibold leading-none tabular-nums ${tone.text}`}>{overall}%</span>
        <div className="flex-1 pb-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${overall}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            Required {pct(fit.requiredFit)}% · preferred {pct(fit.preferredFit)}%
          </p>
        </div>
      </div>

      <SkillGroup
        label="Required skills"
        covered={fit.requiredCovered}
        missing={fit.requiredMissing}
        rate={fit.requiredFit}
      />
      <SkillGroup
        label="Preferred skills"
        covered={fit.preferredCovered}
        missing={fit.preferredMissing}
        rate={fit.preferredFit}
      />

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Teal = evidence found in your repos &amp; profile · red = no evidence yet. A keyword-evidence
        measure, not a recruiter verdict — upgrade for a verified skill-by-skill assessment.
      </p>
    </section>
  )
}
