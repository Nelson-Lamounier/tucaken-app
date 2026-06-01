'use client'

import { useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import type { ApplicationDetail, ApplicationStatus } from '@/lib/types/applications.types'
import { useApplicationStatus } from '@/hooks/use-admin-applications'
import { Card } from '@/components/ui/Card'
import { SectionHeading } from '../components/SectionHeading'
import { ConfirmModal } from '../components/ConfirmModal'
import { useOfferDraft, personalFitScore, type OfferComponents } from '../hooks/useOfferDraft'
import { negotiationLeverage } from '../types/workspace'

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

/**
 * Final / Offer workspace (Stage 7). Offer figures + decision factors are
 * editable and persisted (useOfferDraft). Negotiation leverage is derived from
 * real research evidence; market percentile data has no backend yet (honest
 * placeholder, ADR-0003). Accept/Decline call the real status mutation.
 */
export function FinalWorkspace({ detail }: FinalWorkspaceProps) {
  const { draft, setOffer, setFactor } = useOfferDraft(detail.slug)
  const statusMutation = useApplicationStatus()
  const [showMessage, setShowMessage] = useState(false)
  const [pending, setPending] = useState<DecisionAction | null>(null)

  const fit = useMemo(() => personalFitScore(draft.factors), [draft.factors])
  const leverage = useMemo(() => negotiationLeverage(detail.research), [detail.research])
  const base = parseMoney(draft.offer.base)
  const counter = base !== null ? Math.round(base * 1.1) : null

  function confirmAction() {
    if (!pending) return
    if (pending.status) {
      statusMutation.mutate({ slug: detail.slug, status: pending.status })
    }
    setPending(null)
  }

  return (
    <div className="space-y-8">
      {/* The offer */}
      <section className="space-y-3">
        <SectionHeading title="The offer" subtitle="Editable — auto-saves." />
        <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {OFFER_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label htmlFor={`offer-${key}`} className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</label>
              <input id={`offer-${key}`} type="text" value={draft.offer[key]} onChange={e => setOffer({ [key]: e.target.value })} className={FIELD_CLASS} placeholder="—" />
            </div>
          ))}
        </Card>
      </section>

      {/* Market context */}
      <section className="space-y-3">
        <SectionHeading title="Market context" />
        <Card className="flex items-center gap-3 px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
          <TrendingUp className="size-5 shrink-0 text-zinc-400" aria-hidden />
          Percentile benchmarks (25th / median / 75th) for this role and location land once market data
          is wired up.
        </Card>
      </section>

      {/* Negotiation leverage */}
      <section className="space-y-3">
        <SectionHeading title="Negotiation leverage" subtitle="Factual points the analysis identified." />
        {leverage.length > 0 ? (
          <Card className="p-4">
            <ul className="space-y-2">
              {leverage.map(point => (
                <li key={point} className="text-sm text-zinc-700 dark:text-zinc-300">• {point}</li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            Leverage points appear once the Research Agent has analysed this application.
          </Card>
        )}
      </section>

      {/* Suggested counter */}
      <section className="space-y-3">
        <SectionHeading title="Suggested counter" />
        <Card className="space-y-3 p-4">
          {counter !== null ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Based on your base of {draft.offer.base.trim()}, a reasonable counter is around{' '}
              <span className="font-semibold text-accent">{counter.toLocaleString()}</span>.
            </p>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter a base figure above to see a suggested counter.</p>
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
      </section>

      {/* Decision factors */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading title="Your decision factors" subtitle="Weight what matters, rate how this offer does." />
          <span className="rounded-lg bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] px-3 py-1.5 text-sm font-semibold text-accent">
            Fit {fit}%
          </span>
        </div>
        <Card className="divide-y divide-zinc-200 p-4 dark:divide-white/10">
          {draft.factors.map(factor => (
            <div key={factor.key} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{factor.key}</span>
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                Importance
                <input type="range" min={0} max={10} value={factor.weight} onChange={e => setFactor(factor.key, { weight: Number.parseInt(e.target.value, 10) })} className="accent-(--accent)" />
                <span className="w-4 tabular-nums">{factor.weight}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                This offer
                <input type="range" min={0} max={10} value={factor.score} onChange={e => setFactor(factor.key, { score: Number.parseInt(e.target.value, 10) })} className="accent-(--accent)" />
                <span className="w-4 tabular-nums">{factor.score}</span>
              </label>
            </div>
          ))}
        </Card>
      </section>

      {/* Decision actions */}
      <section className="space-y-3">
        <SectionHeading title="Decision" />
        <div className="flex flex-wrap gap-3">
          {ACTIONS.map(action => (
            <button
              key={action.id}
              type="button"
              onClick={() => setPending(action)}
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
      </section>

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
    </div>
  )
}
