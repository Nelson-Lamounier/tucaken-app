// src/features/account/billing/PaymentSection.tsx
//
// Read-only payment method. Card details are fetched live from Stripe and
// never persisted. All edits route to the Stripe Customer Portal — we never
// see or store a raw card number.

import type { Billing, PaymentMethodView } from '../types'
import { Card } from '../components/primitives'
import { PortalButton } from './PortalButton'
import { usePaymentMethod } from '../hooks/use-payment-method'

interface Props {
  billing: Billing
}

export function PaymentSection({ billing }: Props) {
  const { paymentMethod, isLoading } = usePaymentMethod()

  if (isLoading) {
    return (
      <Card>
        <div className="h-12 w-full animate-pulse rounded-md bg-white/4" />
      </Card>
    )
  }

  if (!paymentMethod) {
    return (
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">
            No card on file. Subscribe to a paid plan to add a payment method.
          </p>
          {billing.stripeCustomerId && (
            <PortalButton customerId={billing.stripeCustomerId} returnPath="/billing">
              Add card
            </PortalButton>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <CardArt brand={paymentMethod.brand} last4={paymentMethod.last4} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-100">
                {paymentMethod.brand} ending in {paymentMethod.last4}
              </span>
              {isExpiringSoon(paymentMethod) && (
                <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-200 ring-1 ring-amber-400/30">
                  Expiring soon
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Expires {String(paymentMethod.expMonth).padStart(2, '0')}/
              {String(paymentMethod.expYear).slice(-2)} · Default for invoices
            </p>
          </div>
        </div>
        <PortalButton customerId={billing.stripeCustomerId} returnPath="/billing">
          Update card
        </PortalButton>
      </div>
    </Card>
  )
}

function isExpiringSoon(pm: PaymentMethodView): boolean {
  const now = new Date()
  const exp = new Date(pm.expYear, pm.expMonth - 1, 1)
  const monthsLeft =
    (exp.getFullYear() - now.getFullYear()) * 12 +
    (exp.getMonth() - now.getMonth())
  return monthsLeft <= 2
}

function CardArt({ brand, last4 }: { brand: string; last4: string }) {
  return (
    <div className="relative h-12 w-20 overflow-hidden rounded-md bg-linear-to-br from-zinc-700 via-zinc-800 to-zinc-900 ring-1 ring-white/10">
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
