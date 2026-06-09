'use client'

import { useMemo } from 'react'
import type {
  ApplicationDetail,
  FinalPrep,
  FinalQuestion,
  FinalTalkingPoint,
} from '@/lib/types/applications.types'
import { SummaryGroup, SummaryRow, RailRichText } from '../components/workspace-shell'
import { useOfferDraft, personalFitScore, type DecisionFactor } from '../hooks/useOfferDraft'
import { resolveStagePrep } from '../types/workspace'

interface FinalWorkspaceProps {
  readonly detail: ApplicationDetail
}

/** Detail body for one decision factor: importance + this-offer sliders. */
function DecisionFactorDetail({
  factor,
  onChange,
}: {
  readonly factor: DecisionFactor
  readonly onChange: (key: string, patch: Partial<Pick<DecisionFactor, 'weight' | 'score'>>) => void
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        Importance
        <input type="range" min={0} max={10} value={factor.weight} onChange={e => onChange(factor.key, { weight: Number.parseInt(e.target.value, 10) })} className="accent-(--accent)" />
        <span className="w-4 tabular-nums">{factor.weight}</span>
      </label>
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        This offer
        <input type="range" min={0} max={10} value={factor.score} onChange={e => onChange(factor.key, { score: Number.parseInt(e.target.value, 10) })} className="accent-(--accent)" />
        <span className="w-4 tabular-nums">{factor.score}</span>
      </label>
    </div>
  )
}


interface FactorsGroupProps {
  readonly factors: readonly DecisionFactor[]
  readonly fit: number
  readonly onChange: (key: string, patch: Partial<Pick<DecisionFactor, 'weight' | 'score'>>) => void
}

/** "Decision factors" — static inline section (no dropdown, no rail). Each factor
 *  shows its weight/score sliders directly on the page. */
function DecisionFactorsGroup({ factors, fit, onChange }: FactorsGroupProps) {
  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Your decision factors</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Weight what matters, rate how this offer does.</p>
        </div>
        <span className="shrink-0 rounded-md bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] px-3 py-1.5 text-sm font-semibold text-accent">
          Fit {fit}%
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {factors.map(factor => (
          <div
            key={factor.key}
            className="rounded-md bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{factor.key}</span>
              <span className="text-xs font-medium tabular-nums text-zinc-500">Weight {factor.weight}</span>
            </div>
            <div className="mt-3">
              <DecisionFactorDetail factor={factor} onChange={onChange} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Rail detail: mutual-fit talking points — each a grounded point + grounding line. */
function MutualFitDetail({ points }: { readonly points: readonly FinalTalkingPoint[] }) {
  return (
    <div className="space-y-2.5">
      {points.map(tp => (
        <div key={tp.point} className="space-y-1 rounded-md border border-zinc-200 p-3 dark:border-white/10">
          <p className="text-sm leading-relaxed text-zinc-900 dark:text-zinc-100">{tp.point}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{tp.grounding}</p>
        </div>
      ))}
    </div>
  )
}

/** Rail detail: substantive questions to ask — each a question with a muted rationale. */
function QuestionsDetail({ questions }: { readonly questions: readonly FinalQuestion[] }) {
  return (
    <ul className="space-y-2">
      {questions.map(q => (
        <li key={q.question} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{q.question}</span>
          <span className="text-zinc-500 dark:text-zinc-400"> — {q.rationale}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The coach's grounded pre-final-round prep — one clickable row per section; the
 * detail opens in the rail (mirrors the Difficult-questions / walkthrough patterns).
 */
function FinalPrepGroup({ prep }: { readonly prep: FinalPrep }) {
  const rowCount =
    (prep.whyThisRole ? 1 : 0) +
    (prep.mutualFitTalkingPoints.length > 0 ? 1 : 0) +
    (prep.substantiveQuestions.length > 0 ? 1 : 0) +
    (prep.longTermFraming ? 1 : 0)
  return (
    <SummaryGroup
      id="final-prep"
      title="Pre-final-round prep"
      subtitle="Grounded in your work — why this role, mutual fit, and what to ask."
      count={rowCount}
    >
      {prep.whyThisRole && (
        <SummaryRow
          id="final-why-this-role"
          label="Why this role"
          detail={<RailRichText text={prep.whyThisRole} />}
        />
      )}
      {prep.mutualFitTalkingPoints.length > 0 && (
        <SummaryRow
          id="final-mutual-fit"
          label="Mutual-fit talking points"
          indicator={<span className="text-xs font-medium tabular-nums text-zinc-500">{prep.mutualFitTalkingPoints.length}</span>}
          detail={<MutualFitDetail points={prep.mutualFitTalkingPoints} />}
        />
      )}
      {prep.substantiveQuestions.length > 0 && (
        <SummaryRow
          id="final-questions"
          label="Substantive questions to ask"
          indicator={<span className="text-xs font-medium tabular-nums text-zinc-500">{prep.substantiveQuestions.length}</span>}
          detail={<QuestionsDetail questions={prep.substantiveQuestions} />}
        />
      )}
      {prep.longTermFraming && (
        <SummaryRow
          id="final-long-term"
          label="Long-term framing"
          detail={<RailRichText text={prep.longTermFraming} />}
        />
      )}
    </SummaryGroup>
  )
}

/**
 * Resolve + render the coach's grounded final-round prep group, or null when no
 * prep exists. Keeps the conditional out of the main workspace function (complexity).
 */
function FinalPrepSection({ detail }: { readonly detail: ApplicationDetail }) {
  const finalPrep: FinalPrep | null = resolveStagePrep(detail, 'final')?.finalPrep ?? null
  if (!finalPrep) return null
  return <FinalPrepGroup prep={finalPrep} />
}

/**
 * Final / Offer workspace (Stage 7). Decision-factor weights are editable and
 * persisted (useOfferDraft). Compensation figures are intentionally NOT collected
 * (PII / contract compliance). Negotiation leverage is the dashboard's left panel;
 * the Accept/Decline decision is the header actions menu.
 *
 * Renders a fragment of SummaryGroups into the WorkspaceShell's left column.
 */
export function FinalWorkspace({ detail }: FinalWorkspaceProps) {
  const { draft, setFactor } = useOfferDraft(detail.slug)

  const fit = useMemo(() => personalFitScore(draft.factors), [draft.factors])
  return (
    <>
      {/* The coach's grounded pre-final-round prep — primary section, when present. */}
      <FinalPrepSection detail={detail} />

      {/* Negotiation leverage is the dashboard's left panel (LeveragePanel), not a
          workspace group. The Accept / Counter / Decline / Request-time decision is
          the header actions menu (ApplicationActionsMenu). */}
      <DecisionFactorsGroup factors={draft.factors} fit={fit} onChange={setFactor} />
    </>
  )
}
