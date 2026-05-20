// src/features/account/billing/PaymentSection.tsx
//
// "Payment method" section. Card-art avatar, brand+last4, expiry-soon
// warning chip, and an inline edit form that swaps in below when toggled.

import { useEffect, useState } from 'react'
import { Check, Edit2, X } from 'lucide-react'
import type { Billing, PaymentMethod } from '../types'
import { Card, Field, inputCls } from '../components/primitives'
import { PortalButton } from './PortalButton'

interface Props {
  billing: Billing
  onUpdateBilling: (patch: Partial<Billing>) => void
}

export function PaymentSection({ billing, onUpdateBilling }: Props) {
  const pm = billing.paymentMethod
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PaymentMethod>(pm)

  useEffect(() => {
    if (!editing) setDraft(pm)
  }, [pm, editing])

  function save() {
    onUpdateBilling({ paymentMethod: draft })
    setEditing(false)
  }

  const expSoon = (() => {
    const now = new Date()
    const exp = new Date(pm.expYear, pm.expMonth - 1, 1)
    const monthsLeft =
      (exp.getFullYear() - now.getFullYear()) * 12 +
      (exp.getMonth() - now.getMonth())
    return monthsLeft <= 2
  })()

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <CardArt brand={pm.brand} last4={pm.last4} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-100">
                {pm.brand} ending in {pm.last4}
              </span>
              {expSoon && (
                <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-200 ring-1 ring-amber-400/30">
                  Expiring soon
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Expires {String(pm.expMonth).padStart(2, '0')}/
              {String(pm.expYear).slice(-2)} · Default for invoices
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Real updates flow through the Stripe Customer Portal (PCI SAQ-A,
              maintained by Stripe). The inline edit form below stays for the
              mock/preview state until a Stripe customer exists. */}
          {billing.stripeCustomerId ? (
            <PortalButton
              customerId={billing.stripeCustomerId}
              returnPath="/billing"
            >
              Update card
            </PortalButton>
          ) : (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <Edit2 className="size-3.5" /> {editing ? 'Cancel' : 'Update card'}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-white/5 pt-5 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Field label="Card number" hint="•••• •••• ••••">
              <input
                value={
                  draft.last4 ? `•••• •••• •••• ${draft.last4}` : ''
                }
                onChange={(e) =>
                  setDraft({ ...draft, last4: e.target.value.slice(-4) })
                }
                className={inputCls()}
              />
            </Field>
          </div>
          <div className="sm:col-span-1">
            <Field label="Month">
              <input
                value={draft.expMonth}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    expMonth: Number(e.target.value) || draft.expMonth,
                  })
                }
                className={inputCls()}
              />
            </Field>
          </div>
          <div className="sm:col-span-1">
            <Field label="Year">
              <input
                value={draft.expYear}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    expYear: Number(e.target.value) || draft.expYear,
                  })
                }
                className={inputCls()}
              />
            </Field>
          </div>
          <div className="sm:col-span-1">
            <Field label="CVC">
              <input placeholder="•••" className={inputCls()} />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 sm:col-span-6">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20"
            >
              <X className="size-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-teal-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              <Check className="size-3.5" strokeWidth={2.5} /> Save card
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

function CardArt({ brand, last4 }: { brand: string; last4: string }) {
  return (
    <div className="relative h-12 w-20 overflow-hidden rounded-md bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 ring-1 ring-white/10">
      <div className="absolute left-1.5 top-1.5 size-3 rounded-sm bg-amber-300/80" />
      <div className="absolute bottom-1 right-2 font-mono text-[8px] font-semibold tracking-wider text-zinc-300">
        {brand.toUpperCase()}
      </div>
      <div className="absolute bottom-3 left-1.5 font-mono text-[8px] tabular-nums text-zinc-400">
        •{last4}
      </div>
    </div>
  )
}
