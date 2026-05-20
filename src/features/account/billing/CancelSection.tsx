// src/features/account/billing/CancelSection.tsx
//
// Rose-tinted danger zone with a two-step confirm. Once cancellation is
// scheduled, the button flips to "Reactivate". Both actions call Stripe via
// the cancel/resumeSubscriptionFn server functions; the webhook reconciles
// state later and onUpdateBilling provides an optimistic local update so the
// UI does not wait a full round-trip.

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import type { Billing } from '../types'
import { fmtDate } from '../components/primitives'
import { adminKeys } from '@/lib/api/query-keys'
import {
  cancelSubscriptionFn,
  resumeSubscriptionFn,
} from '@/server/billing'

interface Props {
  billing: Billing
  onUpdateBilling: (patch: Partial<Billing>) => void
}

export function CancelSection({ billing, onUpdateBilling }: Props) {
  const cancelAtPeriodEnd = billing.cancelAtPeriodEnd
  const subscriptionId = billing.stripeSubscriptionId ?? null
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  async function toggleCancel() {
    if (!subscriptionId) {
      setError('No active subscription. Upgrade to a paid plan first.')
      return
    }
    setError(null)
    setWorking(true)
    try {
      const fn = cancelAtPeriodEnd ? resumeSubscriptionFn : cancelSubscriptionFn
      const result = await fn({ data: { subscriptionId } })
      // Optimistic local update — webhook will reconfirm once Stripe round-trips.
      onUpdateBilling({
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        ...(result.currentPeriodEnd
          ? { renewsAt: result.currentPeriodEnd }
          : {}),
      })
      // Refresh /me so any other consumers (PlanSection banner, etc.) pick
      // up the new state.
      await queryClient.invalidateQueries({ queryKey: adminKeys.me.detail() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update subscription.')
    } finally {
      setWorking(false)
      setConfirming(false)
    }
  }

  return (
    <div className="rounded-xl border border-rose-400/15 bg-rose-500/[0.03] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-500/10 ring-1 ring-rose-400/20">
            <AlertTriangle className="size-4 text-rose-300" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-rose-100">
              {cancelAtPeriodEnd
                ? 'Subscription set to cancel'
                : 'Cancel subscription'}
            </h4>
            <p className="mt-1 max-w-[60ch] text-[11px] leading-relaxed text-rose-200/70">
              {cancelAtPeriodEnd ? (
                <>
                  You'll be downgraded to the Free plan on{' '}
                  <span className="font-medium text-rose-100">
                    {fmtDate(billing.renewsAt)}
                  </span>
                  . Generated resumes and articles stay accessible on your
                  account.
                </>
              ) : (
                <>
                  You'll keep access until{' '}
                  <span className="font-medium text-rose-100">
                    {fmtDate(billing.renewsAt)}
                  </span>
                  . After that you'll move to the Free plan and lose AI
                  bullet rewriting and custom domains.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cancelAtPeriodEnd ? (
            <button
              type="button"
              onClick={toggleCancel}
              disabled={working || !subscriptionId}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 transition hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              {working ? 'Reactivating…' : 'Reactivate'}
            </button>
          ) : !confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!subscriptionId}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel subscription
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={working}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 disabled:opacity-50"
              >
                Keep subscription
              </button>
              <button
                type="button"
                onClick={toggleCancel}
                disabled={working}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
              >
                {working && <Loader2 className="size-3.5 animate-spin" />}
                {working ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
          {error}
        </p>
      )}
    </div>
  )
}
