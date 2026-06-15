'use client'

import { ShieldCheck, Gauge, Link2, GitBranch, FolderGit2, FileUser } from 'lucide-react'
import type { KbRetrievalStats, SkillEvidenceEntry, SkillEvidenceLane } from '@/lib/types/applications.types'
import {
  tallyLedger,
  retrievalRepoCounts,
  correlationSummary,
  retrievalTone,
  tallyLanes,
  LANE_LABEL,
  LANE_ORDER,
  type QualityTone,
} from '../lib/evidence-quality'

// ── Tone → colour ───────────────────────────────────────────────────────────

const LANE_ICON: Record<SkillEvidenceLane, React.ReactNode> = {
  repo: <GitBranch className="size-3.5" aria-hidden />,
  project: <FolderGit2 className="size-3.5" aria-hidden />,
  career: <FileUser className="size-3.5" aria-hidden />,
}

// Retrieval-relevance verdict. Deliberately NOT "…match" — this measures how
// relevant the RAG passages were (max cosine), NOT candidate↔role fit.
const TONE: Record<QualityTone, { label: string; text: string; dot: string }> = {
  strong:   { label: 'Strong',  text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  moderate: { label: 'Moderate', text: 'text-amber-700 dark:text-amber-300',    dot: 'bg-amber-500' },
  weak:     { label: 'Weak',     text: 'text-rose-700 dark:text-rose-300',       dot: 'bg-rose-500' },
  none:     { label: 'None',     text: 'text-rose-700 dark:text-rose-300',       dot: 'bg-rose-500' },
}

// ── Coverage bar ─────────────────────────────────────────────────────────────

/** Segmented verified/transferable/gap bar with a count legend. */
function CoverageBar({ ledger }: { readonly ledger: readonly SkillEvidenceEntry[] }) {
  const t = tallyLedger(ledger)
  if (t.total === 0) return null
  const seg = (n: number) => `${(n / t.total) * 100}%`
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
        {t.verified > 0 && <div className="h-full bg-emerald-500" style={{ width: seg(t.verified) }} aria-hidden />}
        {t.transferable > 0 && <div className="h-full bg-amber-500" style={{ width: seg(t.transferable) }} aria-hidden />}
        {t.gap > 0 && <div className="h-full bg-zinc-300 dark:bg-white/20" style={{ width: seg(t.gap) }} aria-hidden />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <LegendDot className="bg-emerald-500" label="Verified" value={t.verified} />
        <LegendDot className="bg-amber-500" label="Transferable" value={t.transferable} />
        <LegendDot className="bg-zinc-300 dark:bg-white/20" label="Gap" value={t.gap} />
      </div>
    </div>
  )
}

function LegendDot({ className, label, value }: { readonly className: string; readonly label: string; readonly value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
      <span className={`size-2 rounded-full ${className}`} aria-hidden />
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-zinc-400">{label}</span>
    </span>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

interface EvidenceQualityOverviewProps {
  readonly ledger?: readonly SkillEvidenceEntry[]
  readonly retrieval?: KbRetrievalStats
}

/**
 * "Evidence quality" — a single correlated rollup that sits above the detail
 * panels. Left: skill coverage (verified/transferable/gap across all JD skills).
 * Right: retrieval relevance verdict. Bottom: the cross-check line — how many
 * verified skills cite a repo that ALSO surfaced in semantic retrieval
 * (double-confirmed = structural + semantic). Renders nothing without a ledger.
 */
export function EvidenceQualityOverview({ ledger, retrieval }: EvidenceQualityOverviewProps) {
  if (!ledger || ledger.length === 0) return null

  const t = tallyLedger(ledger)
  const tone = TONE[retrievalTone(retrieval)]
  const counts = retrievalRepoCounts(retrieval)
  const corr = correlationSummary(ledger, counts)
  const lanes = tallyLanes(ledger)

  return (
    <section className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2">
      <header className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-accent" aria-hidden />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Evidence quality</h2>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Evidence coverage — the JD's NAMED tools mapped to evidence. Distinct
            from the "Skill coverage" donut, which is the matcher's broader
            assessment (verified/partial/gaps over its own skill set). */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Evidence coverage</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{t.withEvidence}</span>
              {' of '}{t.total} JD tools
            </span>
          </div>
          <CoverageBar ledger={ledger} />
          <p className="text-[11px] leading-snug text-zinc-400">
            Named JD tools with file/bridge evidence — distinct from the overall skill assessment.
          </p>
        </div>

        {/* Retrieval verdict */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Retrieval relevance</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
              <span className={`size-2 rounded-full ${tone.dot}`} aria-hidden />
              {tone.label}
            </span>
          </div>
          {retrieval && retrieval.passageCount > 0 ? (
            <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <Gauge className="size-3.5" aria-hidden />
                best <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-200">{retrieval.maxCosine.toFixed(2)}</span>
              </span>
              <span>
                <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{retrieval.passageCount}</span> passages above floor
              </span>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No portfolio passages cleared the relevance floor.</p>
          )}
        </div>
      </div>

      {/* Source-lane provenance — where the evidence was drawn from. */}
      {lanes.hasLanes && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-zinc-200 pt-3 text-xs dark:border-white/10">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Evidence from</span>
          {LANE_ORDER.map((lane) => (
            <span key={lane} className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <span className="text-zinc-400">{LANE_ICON[lane]}</span>
              <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{lanes.counts[lane]}</span>
              {LANE_LABEL[lane]}
            </span>
          ))}
        </div>
      )}

      {/* Correlation cross-check */}
      {corr.verifiedWithRepos > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/2 dark:text-zinc-300">
          <Link2 className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
              {corr.verifiedRetrieved} of {corr.verifiedWithRepos}
            </span>{' '}
            verified skills cite a repo that also surfaced in semantic retrieval — double-confirmed
            (structural&nbsp;+&nbsp;semantic). The rest are proven by your indexed code but were not
            among this run&apos;s top retrieved passages.
          </span>
        </div>
      )}
    </section>
  )
}
