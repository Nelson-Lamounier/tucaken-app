'use client'

import type {
  ApplicationDetail,
  PartialMatch,
  SkillGap,
  GapMitigation,
  ExperienceSignal,
} from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { KnowledgeBaseHealthPanel } from '@/components/kb/KnowledgeBaseHealthPanel'
import { EvidenceIndicator } from '../components/EvidenceIndicator'
import { SummaryGroup, SummaryRow } from '../components/workspace-shell'
import { CompanyProblemPanel } from '../components/CompanyProblemPanel'
import { SkillEvidenceLedgerPanel } from '../components/SkillEvidenceLedgerPanel'
import { EvidenceQualityOverview } from '../components/EvidenceQualityOverview'
import { retrievalRepoCounts } from '../lib/evidence-quality'
import { YearsGapRow } from '../components/YearsGapRow'
import { RecruiterSnapshotPanel } from '../components/RecruiterSnapshotPanel'

interface AppliedWorkspaceProps {
  readonly detail: ApplicationDetail
}

interface SignalRowProps {
  readonly label: string
  readonly value: string
}

function SignalRow({ label, value }: SignalRowProps) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase text-zinc-400 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{value}</dd>
    </div>
  )
}

const PANEL = 'rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2'

/** Fit-summary panel (left, ~70%). */
function FitSummaryPanel({ summary }: { readonly summary: string }) {
  return (
    <section className={PANEL}>
      <div className="border-l-2 border-[color-mix(in_oklab,var(--accent)_55%,transparent)] py-1 pl-4">
        <p className="mb-2 text-[10px] font-semibold uppercase text-zinc-400 dark:text-zinc-500">
          Fit summary
        </p>
        <p className="text-sm leading-7 tracking-[0.01em] text-zinc-700 dark:text-zinc-200">{summary}</p>
      </div>
    </section>
  )
}

/** Experience-signals panel (right, ~30%). */
function ExperienceSignalsPanel({ signals }: { readonly signals: ExperienceSignal }) {
  return (
    <section className={PANEL}>
      <dl className="space-y-4">
        <SignalRow label="Years expected" value={signals.yearsExpected} />
        <SignalRow label="Domain focus" value={signals.domain} />
        <SignalRow label="Scale expected" value={signals.scale} />
        <SignalRow label="Leadership level" value={signals.leadership} />
      </dl>
    </section>
  )
}

/**
 * Fit & experience — two separate panels side by side: the fit summary (~70%)
 * and the experience signals (~30%). Stacks on mobile.
 */
function FitExperienceSection({ detail }: { readonly detail: ApplicationDetail }) {
  const signals = detail.research?.experienceSignals
  return (
    <div className="grid gap-4 sm:grid-cols-[7fr_3fr]">
      <FitSummaryPanel summary={detail.research?.fitSummary ?? 'Analysis in progress…'} />
      {signals && <ExperienceSignalsPanel signals={signals} />}
    </div>
  )
}

/** Resume-suggestion summary — inline, only when the agent produced one. */
function ResumeSuggestionsGroup({ summary }: { readonly summary: string }) {
  return (
    <SummaryGroup id="resume-suggestions" title="Resume suggestions">
      <Card className="p-4">
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>
      </Card>
    </SummaryGroup>
  )
}

/** Detail body for one partial match. */
function PartialMatchDetail({ match }: { readonly match: PartialMatch }) {
  return (
    <Card className="space-y-2 p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{match.skill}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{match.gapDescription}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">Foundation:</span>{' '}
        {match.transferableFoundation}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">Framing:</span>{' '}
        {match.framingSuggestion}
      </p>
    </Card>
  )
}

/** Partial matches — one row per match; moderate-evidence indicator. */
function PartialMatchesGroup({ matches }: { readonly matches: readonly PartialMatch[] }) {
  return (
    <SummaryGroup
      id="partial-matches"
      title="Partial matches"
      subtitle="Adjacent skills worth framing carefully."
      count={matches.length}
    >
      {matches.map(match => (
        <SummaryRow
          key={match.skill}
          id={`partial-${match.skill}`}
          label={match.skill}
          preview={match.gapDescription}
          indicator={<EvidenceIndicator strength="moderate" />}
          detail={<PartialMatchDetail match={match} />}
        />
      ))}
    </SummaryGroup>
  )
}

/** Detail body for one skills gap. */
/** Severity copy ("minor"/"significant"/…) → ordinal 1–4 for the meter. */
const SEVERITY_LEVEL: Record<string, number> = {
  minor: 1, low: 1, slight: 1, small: 1,
  moderate: 2, medium: 2, partial: 2,
  significant: 3, major: 3, high: 3, substantial: 3, serious: 3,
  critical: 4, severe: 4, disqualifying: 4, blocking: 4,
}

function severityLevel(severity: string): number {
  return SEVERITY_LEVEL[severity.trim().toLowerCase()] ?? 2
}

type SeverityTone = 'amber' | 'orange' | 'red'

function severityTone(level: number, disqualifying: boolean): SeverityTone {
  if (disqualifying || level >= 4) return 'red'
  if (level >= 3) return 'orange'
  return 'amber'
}

const SEVERITY_BAR: Record<SeverityTone, string> = {
  amber: 'bg-amber-500 dark:bg-amber-400',
  orange: 'bg-orange-500 dark:bg-orange-400',
  red: 'bg-red-500 dark:bg-red-400',
}

const SEVERITY_TEXT: Record<SeverityTone, string> = {
  amber: 'text-amber-600 dark:text-amber-400',
  orange: 'text-orange-600 dark:text-orange-400',
  red: 'text-red-600 dark:text-red-400',
}

const SEVERITY_SEGMENTS = [1, 2, 3, 4] as const

/** Four-segment severity meter filled to `level`, in the severity tone. */
function SeverityMeter({ level, tone }: { readonly level: number; readonly tone: SeverityTone }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {SEVERITY_SEGMENTS.map(seg => (
        <span
          key={seg}
          className={`h-1.5 w-4 rounded-sm ${seg <= level ? SEVERITY_BAR[tone] : 'bg-zinc-200 dark:bg-white/10'}`}
        />
      ))}
    </div>
  )
}

/** gapType is REQUIREMENT STRENGTH from the research contract (hard = blocking,
 *  soft = nice-to-have) — rendering it as "{type} skill" mislabelled Podman as
 *  a 'soft skill'. */
const GAP_TYPE_LABEL: Record<string, string> = { hard: 'core requirement', soft: 'nice-to-have' }

function GapRow({ gap, mitigation }: { readonly gap: SkillGap; readonly mitigation?: GapMitigation }) {
  const level = severityLevel(gap.severity)
  const tone = severityTone(level, gap.isDisqualifying)
  return (
    <li className="rounded-md border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{gap.skill}</span>
            {gap.isDisqualifying && (
              <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/20 dark:text-red-400">
                Disqualifying
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{GAP_TYPE_LABEL[gap.gapType] ?? gap.gapType}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <SeverityMeter level={level} tone={tone} />
          <span className={`text-[11px] font-medium capitalize ${SEVERITY_TEXT[tone]}`}>{gap.severity}</span>
        </div>
      </div>
      {mitigation && (
        <div className="mt-2 rounded border border-teal-200/60 bg-teal-50/50 px-2.5 py-2 dark:border-teal-400/20 dark:bg-teal-400/5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">Your honest defence</span>
            <span className="rounded bg-teal-100 px-1 py-px text-[10px] font-medium capitalize text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">{mitigation.goNoGo.replace('_', ' ')}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">{mitigation.honestFraming}</p>
          {mitigation.bridgeNarrative && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{mitigation.bridgeNarrative}</p>
          )}
        </div>
      )}
    </li>
  )
}

/** Loose skill↔mitigation match: 'HPC / simulation' covers both 'HPC' and 'simulation'. */
function mitigationFor(skill: string, mitigations: readonly GapMitigation[]): GapMitigation | undefined {
  const s = skill.trim().toLowerCase()
  return mitigations.find(m => {
    const g = m.gap.trim().toLowerCase()
    return g.includes(s) || s.includes(g)
  })
}

/** Skills gaps — a fixed panel with a per-gap severity meter and, when the
 *  analysis produced one, the honest defence for each gap (exported for tests). */
export function SkillsGapsPanel({ gaps, mitigations = [] }: {
  readonly gaps: readonly SkillGap[]
  readonly mitigations?: readonly GapMitigation[]
}) {
  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Skills gaps</h3>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          {gaps.length}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Where the role asks for more than the evidence shows.</p>
      <ul className="space-y-2">
        {gaps.map(gap => (
          <GapRow key={gap.skill} gap={gap} mitigation={mitigationFor(gap.skill, mitigations)} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Applied workspace (Stage 1). The post-analysis review surface: fit & experience,
 * skill evidence, partial matches and gaps. Renders a fragment into the
 * WorkspaceShell's left column. The resume attachments / edit / publish / delete
 * actions live in the header menu (see ApplicationActionsMenu).
 */
export function AppliedWorkspace({ detail }: AppliedWorkspaceProps) {
  const partialMatches = detail.research?.partialMatches ?? []
  const gaps = detail.research?.gaps ?? []
  const gapMitigations = detail.analysis?.gapMitigations ?? []
  const resumeSummary = detail.analysis?.resumeSuggestions?.summary
  const yearsGap = detail.analysis?.yearsGap
  const recruiterSnapshot = detail.analysis?.recruiterSnapshot

  return (
    <>
      <FitExperienceSection detail={detail} />

      {yearsGap ? <YearsGapRow yearsGap={yearsGap} /> : null}

      <EvidenceQualityOverview
        ledger={detail.research?.skillEvidenceLedger}
        retrieval={detail.research?.kbRetrievalStats}
      />

      <KnowledgeBaseHealthPanel compact retrieval={detail.research?.kbRetrievalStats} />

      {detail.research?.companyProblem ? (
        <CompanyProblemPanel problem={detail.research.companyProblem} />
      ) : null}

      {detail.research?.skillEvidenceLedger?.length ? (
        <SkillEvidenceLedgerPanel
          ledger={detail.research.skillEvidenceLedger}
          retrievalRepoCounts={retrievalRepoCounts(detail.research?.kbRetrievalStats)}
        />
      ) : null}

      {recruiterSnapshot ? <RecruiterSnapshotPanel snapshot={recruiterSnapshot} /> : null}

      {resumeSummary ? <ResumeSuggestionsGroup summary={resumeSummary} /> : null}

      {(partialMatches.length > 0 || gaps.length > 0) && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {partialMatches.length > 0 && <PartialMatchesGroup matches={partialMatches} />}
          {gaps.length > 0 && <SkillsGapsPanel gaps={gaps} mitigations={gapMitigations} />}
        </div>
      )}
    </>
  )
}
