// src/features/account/billing/CancelSection.tsx
//
// Rose-tinted danger zone with a two-step confirm. Once cancellation is
// scheduled, the button flips to "Reactivate".

import { useState } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import type { Billing } from '../types'
import { fmtDate } from '../components/primitives'

interface Props {
  billing: Billing
  onUpdateBilling: (patch: Partial<Billing>) => void
}

export function CancelSection({ billing, onUpdateBilling }: Props) {
  const cancelAtPeriodEnd = billing.cancelAtPeriodEnd
  const [confirming, setConfirming] = useState(false)

  function toggleCancel() {
    onUpdateBilling({ cancelAtPeriodEnd: !cancelAtPeriodEnd })
    setConfirming(false)
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
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 transition hover:bg-teal-500/20"
            >
              <RotateCcw className="size-3.5" /> Reactivate
            </button>
          ) : !confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
            >
              Cancel subscription
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20"
              >
                Keep subscription
              </button>
              <button
                type="button"
                onClick={toggleCancel}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/30"
              >
                Yes, cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
