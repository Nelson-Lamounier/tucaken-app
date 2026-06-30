"use client"
// src/app/checkout.$tier.tsx
//
// Embedded Checkout mount with split order-summary layout.
//
// Layout adapted from TailwindPlus "Split with order summary" — re-skinned to
// repo palette (zinc-950 body, teal-900 summary panel, white text). The
// right column hosts Stripe's <EmbeddedCheckout/> instead of a custom form,
// so PCI scope stays SAQ-A.
//
// URL: /checkout/pro · /checkout/premium

import { createFileRoute, notFound, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { CheckoutConsent } from '@/features/billing/components/CheckoutConsent'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js'
import { createCheckoutSessionFn } from '@/server/billing'
import { findTier } from '@/features/billing/catalog'
import type { PlanId } from '@/features/account/types'

// loadStripe is cached internally, but holding our own promise prevents a
// second fetch when React re-renders before the first resolves.
let stripePromise: Promise<Stripe | null> | null = null
function getStripe() {
  if (stripePromise) return stripePromise
  const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  if (!pk) {
    throw new Error(
      'VITE_STRIPE_PUBLISHABLE_KEY is not set. Add it to .env.local (pk_test_…).',
    )
  }
  stripePromise = loadStripe(pk)
  return stripePromise
}

export const Route = createFileRoute('/checkout/$tier')({
  parseParams: ({ tier }) => {
    if (tier !== 'pro' && tier !== 'premium') throw notFound()
    return { tier: tier as Exclude<PlanId, 'free'> }
  },
  component: CheckoutRoute,
})

function CheckoutRoute() {
  const { tier } = Route.useParams()
  const tierMeta = findTier(tier)!

  const [accepted, setAccepted] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['checkout-session', tier],
    queryFn: () => createCheckoutSessionFn({ data: { tier, termsAccepted: true } }),
    enabled: accepted,
    // Stripe sessions expire ~24h. Never reuse a stale clientSecret across
    // remounts — it would attach the embedded form to a closed session.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })

  const options = useMemo(
    () => (data?.clientSecret ? { clientSecret: data.clientSecret } : null),
    [data?.clientSecret],
  )

  const monthlyTotal = tierMeta.priceMonthly
  const taxes = 0 // Stripe Tax disabled in createCheckoutSessionFn; surface "—" instead

  return (
    // Layout: on lg+ the page is exactly viewport-height (`lg:h-dvh`) with
    // each column owning its own vertical scroll (`lg:overflow-y-auto`). The
    // Stripe iframe is tall but it now scrolls *inside* the right column
    // instead of pushing the page past 100vh. On <lg, columns stack and the
    // window scrolls naturally so mobile keyboards don't fight a clipped pane.
    //
    // Real grid columns replace the previous fixed-position bg trick — fewer
    // DOM nodes, no off-screen overflow risk, and the gradient column ends
    // exactly at the grid line.
    <div className="bg-white text-zinc-900 lg:flex lg:h-dvh lg:overflow-hidden">
      <h1 className="sr-only">Checkout</h1>

      {/* Payment column — left on lg, second (below summary) on mobile.
          Owns its own vertical scroll so the Stripe iframe never pushes the
          page past 100vh on desktop. */}
      <section
        aria-labelledby="payment-heading"
        className="order-2 bg-white px-4 py-6 sm:px-6 lg:order-1 lg:h-full lg:w-1/2 lg:overflow-y-auto lg:px-8 lg:py-8"
      >
        <div className="mx-auto w-full max-w-lg">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to pricing
          </Link>

          <h2
            id="payment-heading"
            className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900"
          >
            Payment details
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Secure payment processed by Stripe. We never see your card number.
          </p>

          <div className="mt-5 space-y-4">
            <CheckoutConsent accepted={accepted} onChange={setAccepted} />
            <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
              {!accepted && (
                <p className="px-3 py-6 text-center text-sm text-zinc-500">
                  Agree to the terms above to continue to payment.
                </p>
              )}
              {accepted && isLoading && <Skeleton />}
              {accepted && error && <ErrorBox message={(error as Error).message} />}
              {accepted && options && (
                <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Your card will be charged EUR{monthlyTotal} today and on the same date
            each month until you cancel.
          </p>
        </div>
      </section>

      {/* Summary column — right on lg, first (top) on mobile. */}
      <section
        aria-labelledby="summary-heading"
        className="order-1 bg-gradient-to-br from-teal-900 via-emerald-900 to-zinc-900 px-4 py-6 text-teal-100 sm:px-6 lg:order-2 lg:h-full lg:w-1/2 lg:overflow-y-auto lg:px-8 lg:py-8"
      >
        <div className="mx-auto w-full max-w-md">
          <h2 id="summary-heading" className="sr-only">
            Order summary
          </h2>

          <dl>
            <dt className="font-mono text-xs uppercase tracking-widest text-teal-200/80">
              Amount due today
            </dt>
            <dd className="mt-1 text-3xl font-bold tracking-tight text-white">
              €{monthlyTotal}.00
            </dd>
          </dl>

          <ul className="mt-5 divide-y divide-white/10 text-sm font-medium">
            <li className="flex items-start space-x-4 py-4">
              <div className="flex size-11 flex-none items-center justify-center rounded-lg bg-white/10 font-mono text-base text-white">
                {tierMeta.name[0]}
              </div>
              <div className="flex-auto space-y-0.5">
                <h3 className="text-white">Tucaken {tierMeta.name}</h3>
                <p className="text-teal-200/80">{tierMeta.blurb}</p>
                <p className="text-xs text-teal-200/60">
                  Billed monthly · cancel anytime
                </p>
              </div>
              <p className="flex-none text-base font-medium text-white">
                €{monthlyTotal}.00
              </p>
            </li>
          </ul>

          <dl className="space-y-2.5 border-t border-white/10 pt-4 text-sm font-medium">
            <div className="flex items-center justify-between">
              <dt>Subtotal</dt>
              <dd>€{monthlyTotal}.00</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Taxes</dt>
              <dd>{taxes ? `€${taxes}.00` : 'Calculated by Stripe'}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-3 text-white">
              <dt className="text-base">Total today</dt>
              <dd className="text-base">€{monthlyTotal}.00</dd>
            </div>
          </dl>

          <ul className="mt-5 space-y-1.5 text-xs text-teal-200/80">
            {tierMeta.features.slice(0, 4).map((f) => (
              <li key={f} className="flex gap-x-2">
                <span className="text-teal-300">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

function Skeleton() {
  return <div className="h-[520px] animate-pulse rounded-xl bg-zinc-100" />
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
      <p className="font-medium">Couldn't start checkout.</p>
      <p className="mt-1 text-red-300/80">{message}</p>
    </div>
  )
}
