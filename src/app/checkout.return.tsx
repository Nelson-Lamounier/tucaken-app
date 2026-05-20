"use client"
// src/app/checkout.return.tsx
//
// Stripe redirects the customer here after Embedded Checkout completes:
//   /checkout/return?session_id=cs_test_…
//
// We retrieve the session server-side to confirm it's actually paid (the URL
// is user-controllable, so we can't trust it on its own). Webhooks remain the
// source of truth for subscription state — this page only renders the success
// UX, not durable side effects.
//
// The success CTA branches on auth status:
//   · Authenticated  → "Open your dashboard" → /overview
//                      (their plan is upgraded in admin-api when the
//                      `customer.subscription.updated` webhook fires)
//   · Guest checkout → "Create your account" → /sign-in (signup tab) with
//                      `callbackUrl=/onboarding` so they finish onboarding,
//                      then land in the dashboard.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { getCheckoutSessionFn } from '@/server/billing'
import { findTier } from '@/features/billing/catalog'

export const Route = createFileRoute('/checkout/return')({
  validateSearch: z.object({ session_id: z.string().startsWith('cs_') }),
  component: CheckoutReturnRoute,
})

function CheckoutReturnRoute() {
  const { session_id } = Route.useSearch()
  // Root context provides `auth.user` for every route via __root.tsx beforeLoad.
  const { auth } = Route.useRouteContext()

  const { data, isLoading, error } = useQuery({
    queryKey: ['checkout-return', session_id],
    queryFn: () => getCheckoutSessionFn({ data: { sessionId: session_id } }),
    retry: 1,
  })

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-16 text-zinc-100">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
        {isLoading && (
          <State icon={<Loader2 className="animate-spin" />} title="Confirming…" />
        )}
        {error && (
          <State
            icon={<XCircle className="text-red-400" />}
            title="Could not confirm session"
            sub={(error as Error).message}
          />
        )}
        {data?.status === 'complete' && (
          <Success
            tier={data.tier}
            email={data.customerEmail}
            authenticated={Boolean(auth.user)}
          />
        )}
        {data?.status === 'open' && (
          <State
            icon={<Loader2 className="animate-spin" />}
            title="Still processing"
            sub="Refresh in a moment. Your card has not been charged twice."
          />
        )}
        {data?.status === 'expired' && (
          <State
            icon={<XCircle className="text-amber-400" />}
            title="This checkout expired"
            sub="Start a new one from the pricing page."
          />
        )}
      </div>
    </main>
  )
}

function Success({
  tier,
  email,
  authenticated,
}: {
  tier: string | null
  email: string | null
  authenticated: boolean
}) {
  const t = tier ? findTier(tier as never) : undefined
  const tierName = t?.name ?? 'your new plan'

  if (authenticated) {
    // Existing user upgrade flow (e.g. Free → Pro from /_dashboard/billing).
    // Subscription webhook flips their plan in admin-api; dashboard reflects
    // it on next render.
    return (
      <>
        <State
          icon={<CheckCircle2 className="text-emerald-400" />}
          title={`You're on ${tierName} now`}
          sub={
            email
              ? `Receipt sent to ${email}. The new limits are active on your account immediately.`
              : 'Receipt sent. The new limits are active on your account immediately.'
          }
        />
        <Link
          to="/overview"
          className="mt-6 inline-block rounded-full bg-teal-500 px-5 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-400"
        >
          Open your dashboard
        </Link>
        <p className="mt-3 text-xs text-zinc-500">
          Manage billing any time from{' '}
          <Link to="/billing" className="underline hover:text-zinc-300">
            Account → Billing
          </Link>
          .
        </p>
      </>
    )
  }

  // Guest checkout — payment succeeded but there is no user record yet. We
  // need them to sign up before we can attach the Stripe customer to a user.
  // Email is passed in `?email=` so the sign-up form can prefill it; the
  // webhook will match by email once admin-api lookups exist.
  const signUpUrl = email
    ? `/sign-in?callbackUrl=${encodeURIComponent('/onboarding')}&email=${encodeURIComponent(email)}`
    : `/sign-in?callbackUrl=${encodeURIComponent('/onboarding')}`

  return (
    <>
      <State
        icon={<CheckCircle2 className="text-emerald-400" />}
        title={`Welcome to ${tierName}`}
        sub={
          email
            ? `Receipt sent to ${email}. Create your account next so we can connect your subscription and start onboarding.`
            : 'Receipt sent. Create your account next so we can connect your subscription and start onboarding.'
        }
      />
      <a
        href={signUpUrl}
        className="mt-6 inline-block rounded-full bg-teal-500 px-5 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-400"
      >
        Create your account
      </a>
      <p className="mt-3 text-xs text-zinc-500">
        Already signed up?{' '}
        <Link to="/sign-in" className="underline hover:text-zinc-300">
          Log in
        </Link>{' '}
        to link this subscription.
      </p>
    </>
  )
}

function State({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode
  title: string
  sub?: string
}) {
  return (
    <div>
      <div className="mx-auto flex h-12 w-12 items-center justify-center">
        {icon}
      </div>
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      {sub && <p className="mt-2 text-sm text-zinc-400">{sub}</p>}
    </div>
  )
}
