// src/features/account/billing/PlanSection.tsx
//
// "Plan" section on the Billing page. Current-plan banner with renew date and
// monthly/annual toggle, followed by a 3-tier plan grid (Free / Pro / Premium)
// with upgrade/downgrade affordance.
//
// Routing behaviour for the CTA buttons:
//   · Free → Pro / Premium  : navigate to /checkout/$tier (new subscription)
//   · Paid → other paid     : open Stripe Billing Portal (Stripe handles
//                             prorated mid-cycle plan change)
//   · Paid → Free           : open Stripe Billing Portal cancel flow

import { ArrowDown, ArrowUp, Check, ExternalLink, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Billing, BillingInterval, PlanId } from '../types'
import { fmtDate, fmtMoney } from '../components/primitives'
import { PLANS, planRank } from './plans'
import { createPortalSessionFn } from '@/server/billing'

interface Props {
  billing: Billing
  onUpdateBilling: (patch: Partial<Billing>) => void
}

export function PlanSection({ billing, onUpdateBilling }: Props) {
  const interval = billing.interval
  const currentPlan = PLANS.find((p) => p.id === billing.plan)!
  const renews = fmtDate(billing.renewsAt)
  const navigate = useNavigate()
  const [portalLoading, setPortalLoading] = useState<PlanId | null>(null)
  const [portalError, setPortalError] = useState<string | null>(null)

  function setInterval_(v: BillingInterval) {
    onUpdateBilling({ interval: v })
  }

  async function selectPlan(id: PlanId) {
    if (id === billing.plan) return
    setPortalError(null)

    // Free → paid: fresh subscription via Embedded Checkout. Stripe creates
    // the customer record at checkout completion; webhook links it to this
    // user account.
    if (billing.plan === 'free' && id !== 'free') {
      await navigate({
        to: '/checkout/$tier',
        params: { tier: id as 'pro' | 'premium' },
      })
      return
    }

    // Any change involving an existing Stripe customer goes through the
    // Billing Portal — Stripe handles proration, taxes, dunning correctly.
    if (!billing.stripeCustomerId) {
      setPortalError(
        'No Stripe customer linked yet. Finish the initial subscription first.',
      )
      return
    }
    setPortalLoading(id)
    try {
      const { url } = await createPortalSessionFn({
        data: {
          customerId: billing.stripeCustomerId,
          returnPath: '/billing',
        },
      })
      window.location.assign(url)
    } catch (e) {
      setPortalError(e instanceof Error ? e.message : 'Could not open portal.')
      setPortalLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Current plan banner */}
      <div className="rounded-xl border border-teal-400/20 bg-gradient-to-br from-teal-500/[0.07] via-emerald-500/[0.04] to-transparent p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-200 ring-1 ring-teal-400/30">
                Current
              </span>
              <h3 className="text-base font-semibold text-zinc-50">
                {currentPlan.name}
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              {billing.cancelAtPeriodEnd ? (
                <>
                  Cancels on{' '}
                  <span className="text-zinc-200">{renews}</span>. You'll keep
                  access until then.
                </>
              ) : (
                <>
                  Renews <span className="text-zinc-200">{renews}</span> ·{' '}
                  {fmtMoney(
                    interval === 'annual'
                      ? currentPlan.yearly
                      : currentPlan.price,
                  )}
                  /{interval === 'annual' ? 'yr' : 'mo'}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Billing
            </span>
            <div className="inline-flex rounded-md border border-white/10 bg-zinc-950/40 p-0.5 text-xs">
              {(
                [
                  { v: 'monthly', l: 'Monthly' },
                  { v: 'annual', l: 'Annual' },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setInterval_(o.v)}
                  className={[
                    'rounded px-3 py-1 transition whitespace-nowrap',
                    interval === o.v
                      ? 'bg-white/[0.06] text-zinc-100 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {o.l}
                  {o.v === 'annual' && (
                    <span className="ml-1 text-[9px] font-semibold text-teal-300">
                      −2mo
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Plan grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.id === billing.plan
          const price =
            interval === 'annual' ? Math.round(p.yearly / 12) : p.price
          const isUpgrade = planRank(p.id) > planRank(billing.plan)
          return (
            <div
              key={p.id}
              className={[
                'relative rounded-xl border p-5 transition',
                isCurrent
                  ? 'border-teal-400/30 bg-teal-500/[0.04]'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20',
              ].join(' ')}
            >
              {p.popular && !isCurrent && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-teal-400 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-950">
                  Popular
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-semibold text-zinc-100">
                  {p.name}
                </h4>
                {isCurrent && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-teal-300">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                {p.blurb}
              </p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums text-zinc-50">
                  ${price}
                </span>
                <span className="text-[11px] text-zinc-500">/ mo</span>
                {interval === 'annual' && p.yearly > 0 && (
                  <span className="ml-1 text-[10px] text-zinc-600">
                    billed ${p.yearly}/yr
                  </span>
                )}
              </div>
              <ul className="mt-4 space-y-1.5">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 text-[11px] text-zinc-400"
                  >
                    <Check
                      className="mt-0.5 size-3 shrink-0 text-teal-400"
                      strokeWidth={2.5}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => selectPlan(p.id)}
                disabled={isCurrent || portalLoading === p.id}
                className={[
                  'mt-4 inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-60',
                  isCurrent
                    ? 'cursor-default border border-white/5 bg-white/[0.02] text-zinc-500'
                    : isUpgrade
                      ? 'bg-teal-500 text-zinc-950 hover:bg-teal-400'
                      : 'border border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]',
                ].join(' ')}
              >
                {isCurrent ? (
                  'Your plan'
                ) : portalLoading === p.id ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Opening…
                  </>
                ) : billing.plan !== 'free' ? (
                  <>
                    <ExternalLink className="size-3.5" />{' '}
                    {isUpgrade ? 'Upgrade' : 'Change'}
                  </>
                ) : isUpgrade ? (
                  <>
                    <ArrowUp className="size-3.5" /> Upgrade
                  </>
                ) : (
                  <>
                    <ArrowDown className="size-3.5" /> Downgrade
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>
      {portalError && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {portalError}
        </p>
      )}
    </div>
  )
}
