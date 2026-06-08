'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'
import type {
  ApplicationDetail,
  ApplicationStatus,
  FinalPrep,
  FinalQuestion,
  FinalTalkingPoint,
} from '@/lib/types/applications.types'
import { useApplicationStatus } from '@/hooks/use-admin-applications'
import { Card } from '@/components/ui/Card'
import { ConfirmModal } from '../components/ConfirmModal'
import { SummaryGroup, SummaryRow, RailRichText } from '../components/workspace-shell'
import { useOfferDraft, personalFitScore, type OfferComponents, type DecisionFactor } from '../hooks/useOfferDraft'
import { negotiationLeverage, resolveStagePrep } from '../types/workspace'

interface FinalWorkspaceProps {
  readonly detail: ApplicationDetail
}

const OFFER_FIELDS: readonly { key: keyof OfferComponents; label: string }[] = [
  { key: 'base', label: 'Base' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'equity', label: 'Equity' },
  { key: 'signing', label: 'Signing' },
  { key: 'other', label: 'Other' },
]

const FIELD_CLASS =
  'block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10'

interface DecisionAction {
  readonly id: string
  readonly label: string
  readonly title: string
  readonly body: string
  readonly status?: ApplicationStatus
  readonly destructive?: boolean
}

const ACTIONS: readonly DecisionAction[] = [
  { id: 'accept', label: 'Accept', title: 'Accept this offer?', body: 'This marks the application as accepted.', status: 'accepted' },
  { id: 'counter', label: 'Counter', title: 'Send a counter?', body: 'Note that you are countering. Update the offer figures once they respond.' },
  { id: 'decline', label: 'Decline', title: 'Decline this offer?', body: 'This marks the application as rejected.', status: 'rejected', destructive: true },
  { id: 'request-time', label: 'Request more time', title: 'Request more time?', body: 'A reminder to ask for a decision extension — no status change.' },
]

/** Parse a free-text money string to a number (strip currency/commas). */
function parseMoney(value: string): number | null {
  const digits = value.replace(/[^0-9.]/g, '')
  if (!digits) return null
  const n = Number.parseFloat(digits)
  return Number.isFinite(n) ? n : null
}

/** Offer figures form — the primary editable control, rendered inline. */
function OfferForm({
  offer,
  onChange,
}: {
  readonly offer: OfferComponents
  readonly onChange: (patch: Partial<OfferComponents>) => void
}) {
  return (
    <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {OFFER_FIELDS.map(({ key, label }) => (
        <div key={key}>
          <label htmlFor={`offer-${key}`} className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</label>
          <input
            id={`offer-${key}`}
            type="text"
            value={offer[key]}
            onChange={e => onChange({ [key]: e.target.value })}
            className={FIELD_CLASS}
            placeholder="—"
          />
        </div>
      ))}
    </Card>
  )
}

/** Detail body for the market-context row (honest placeholder, ADR-0003). */
function MarketContextDetail() {
  return (
    <Card className="flex items-center gap-3 px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
      <TrendingUp className="size-5 shrink-0 text-zinc-400" aria-hidden />
      Percentile benchmarks (25th / median / 75th) for this role and location land once market data
      is wired up.
    </Card>
  )
}

/** Detail body for a single negotiation-leverage point. */
function LeverageDetail({ point }: { readonly point: string }) {
  return (
    <Card className="p-4 text-sm text-zinc-700 dark:text-zinc-300">{point}</Card>
  )
}

/** Detail body for the suggested-counter row: counter + suggested message. */
function SuggestedCounterDetail({
  base,
  counter,
}: {
  readonly base: string
  readonly counter: number | null
}) {
  const [showMessage, setShowMessage] = useState(false)
  return (
    <Card className="space-y-3 p-4">
      {counter !== null ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Based on your base of {base.trim()}, a reasonable counter is around{' '}
          <span className="font-semibold text-accent">{counter.toLocaleString()}</span>.
        </p>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter a base figure in the offer above to see a suggested counter.</p>
      )}
      <button type="button" onClick={() => setShowMessage(s => !s)} className="text-sm font-medium text-accent hover:underline">
        {showMessage ? 'Hide suggested message' : 'See suggested message'}
      </button>
      {showMessage && (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          &ldquo;Thank you for the offer — I&apos;m excited about the role. Based on the scope and my
          experience{counter !== null ? `, I was hoping we could get closer to ${counter.toLocaleString()}` : ''}.
          Is there flexibility on the package?&rdquo;
        </p>
      )}
    </Card>
  )
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
    <Card className="space-y-3 p-4">
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
    </Card>
  )
}

/** "Negotiation leverage" group — one row per factual leverage point. */
function LeverageGroup({ leverage }: { readonly leverage: readonly string[] }) {
  return (
    <SummaryGroup id="negotiation-leverage" title="Negotiation leverage" subtitle="Factual points the analysis identified." count={leverage.length}>
      {leverage.length === 0 && (
        <Card className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
          Leverage points appear once the Research Agent has analysed this application.
        </Card>
      )}
      {leverage.map(point => (
        <SummaryRow key={point} id={point} label={point} preview={point} detail={<LeverageDetail point={point} />} />
      ))}
    </SummaryGroup>
  )
}

interface FactorsGroupProps {
  readonly factors: readonly DecisionFactor[]
  readonly fit: number
  readonly onChange: (key: string, patch: Partial<Pick<DecisionFactor, 'weight' | 'score'>>) => void
}

/** "Decision factors" group — one row per weighted factor; weight is the indicator. */
function DecisionFactorsGroup({ factors, fit, onChange }: FactorsGroupProps) {
  return (
    <SummaryGroup id="decision-factors" title="Your decision factors" subtitle="Weight what matters, rate how this offer does." count={factors.length}>
      <div className="flex justify-end">
        <span className="rounded-lg bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] px-3 py-1.5 text-sm font-semibold text-accent">
          Fit {fit}%
        </span>
      </div>
      {factors.map(factor => (
        <SummaryRow
          key={factor.key}
          id={factor.key}
          label={factor.key}
          indicator={<span className="text-xs font-medium tabular-nums text-zinc-500">Weight {factor.weight}</span>}
          detail={<DecisionFactorDetail factor={factor} onChange={onChange} />}
        />
      ))}
    </SummaryGroup>
  )
}

/** "Decision" group — accept/counter/decline/request-time actions, inline. */
function DecisionGroup({ onPick }: { readonly onPick: (action: DecisionAction) => void }) {
  return (
    <SummaryGroup id="decision" title="Decision">
      <div className="flex flex-wrap gap-3">
        {ACTIONS.map(action => (
          <button
            key={action.id}
            type="button"
            onClick={() => onPick(action)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              action.id === 'accept'
                ? 'bg-(--accent) text-white hover:opacity-90'
                : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </SummaryGroup>
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
 * Final / Offer workspace (Stage 7). Offer figures + decision factors are
 * editable and persisted (useOfferDraft). Negotiation leverage is derived from
 * real research evidence; market percentile data has no backend yet (honest
 * placeholder, ADR-0003). Accept/Decline call the real status mutation.
 *
 * Renders a fragment of SummaryGroups into the WorkspaceShell's left column.
 */
export function FinalWorkspace({ detail }: FinalWorkspaceProps) {
  const { draft, setOffer, setFactor } = useOfferDraft(detail.slug)
  const statusMutation = useApplicationStatus()
  const [pending, setPending] = useState<DecisionAction | null>(null)

  const fit = useMemo(() => personalFitScore(draft.factors), [draft.factors])
  const leverage = useMemo(() => negotiationLeverage(detail.research), [detail.research])
  const base = parseMoney(draft.offer.base)
  const counter = base !== null ? Math.round(base * 1.1) : null

  const counterDetail: ReactNode = <SuggestedCounterDetail base={draft.offer.base} counter={counter} />
  const counterPreview = counter !== null ? `~${counter.toLocaleString()}` : undefined

  function confirmAction() {
    if (!pending) return
    if (pending.status) {
      statusMutation.mutate({ slug: detail.slug, status: pending.status })
    }
    setPending(null)
  }

  return (
    <>
      {/* The coach's grounded pre-final-round prep — primary section, when present. */}
      <FinalPrepSection detail={detail} />

      {/* The offer — primary editable control, rendered inline */}
      <SummaryGroup id="offer" title="The offer" subtitle="Editable — auto-saves.">
        <OfferForm offer={draft.offer} onChange={setOffer} />
      </SummaryGroup>

      {/* Market context */}
      <SummaryGroup id="market-context" title="Market context">
        <SummaryRow id="market-context" label="Market context" detail={<MarketContextDetail />} />
      </SummaryGroup>

      <LeverageGroup leverage={leverage} />

      {/* Suggested counter */}
      <SummaryGroup id="suggested-counter" title="Suggested counter">
        <SummaryRow id="suggested-counter" label="Suggested counter" preview={counterPreview} detail={counterDetail} />
      </SummaryGroup>

      <DecisionFactorsGroup factors={draft.factors} fit={fit} onChange={setFactor} />

      <DecisionGroup onPick={setPending} />

      <ConfirmModal
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmAction}
        title={pending?.title ?? ''}
        body={pending?.body ?? ''}
        confirmLabel={pending?.label ?? 'Confirm'}
        destructive={pending?.destructive}
        busy={statusMutation.isPending}
      />
    </>
  )
}
