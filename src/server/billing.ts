// src/server/billing.ts
//
// Server functions that orchestrate Stripe Subscription Checkout +
// Billing Portal. Production wiring:
//
//   createCheckoutSessionFn — works for both authenticated upgrades (resolves
//     the user's existing Stripe customer or creates+persists a new one) and
//     guest checkouts (no customer attached; webhook captures email instead).
//
//   getCheckoutSessionFn — reads the session after embedded form completion,
//     used by /checkout/return to render success/processing/expired states.
//
//   createPortalSessionFn — opens the Stripe Customer Portal so users can
//     update payment methods, pay past-due invoices, change/cancel plans.
//
// See docs/billing-integration.md for the end-to-end flow and the contracts
// expected by admin-api's /api/internal/billing/* routes.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  stripe,
  priceIdForTierFromConfig,
  tierForPriceIdFromConfig,
  appOrigin,
} from './stripe'
import { requireAuth, tryAuth } from './auth-guard'
import { apiFetch } from './_api-client'
import { internalApiFetch } from './_internal-api-client'
import { logger } from '@/lib/observability/logger'
import type { PlanId, PaymentMethodView, InvoiceView, BillingDetailsView } from '@/features/account/types'
import type { TierConfig } from '@/features/billing/tier-config'
import { enforceBillingRateLimit } from './_rate-limit'

// -----------------------------------------------------------------------------
// Pre-checkout: ensure the authenticated user has a Stripe customer record
// -----------------------------------------------------------------------------

interface MePlanProjection {
  plan: {
    stripeCustomerId: string | null
  }
}

/**
 * For an authenticated user, returns their `cus_…` ID — creating one in
 * Stripe + persisting via admin-api if needed. Idempotent: a second call
 * for the same user returns the same ID without hitting Stripe.
 *
 * Stripe customer metadata stores `userId` so that webhook events whose
 * `client_reference_id` is missing (rare, but happens for portal-initiated
 * subscription changes) can still resolve back to our user row.
 */
async function ensureStripeCustomerForUser(user: {
  id: string
  email: string
}): Promise<string> {
  // 1. Check whether admin-api already knows a customer for this user.
  //    We read through the user-JWT-protected /me endpoint to reuse the
  //    existing auth surface — no special internal call needed here.
  const me = await apiFetch<MePlanProjection>('/me', {
    pathTemplate: '/me',
  })
  if (me.plan.stripeCustomerId) return me.plan.stripeCustomerId

  // 2. None on file → create one in Stripe and persist.
  const customer = await stripe().customers.create({
    email: user.email,
    metadata: { userId: user.id },
  })

  try {
    await internalApiFetch<{ ok: true }>('/api/internal/billing/customers', {
      method: 'POST',
      json: { userId: user.id, customerId: customer.id },
    })
  } catch (err) {
    // Persistence failure leaves us with an orphan Stripe customer. Log
    // loudly so ops can reconcile (Stripe Dashboard → Customers → filter
    // by metadata.userId). We do NOT abandon the checkout — Stripe still
    // has the customer; webhook will recover via `metadata.userId`.
    logger.error(
      { event: 'stripe_customer_persist_failed', userId: user.id, customerId: customer.id, err },
      'stripe.customers.create succeeded but admin-api persistence failed',
    )
  }
  return customer.id
}

// -----------------------------------------------------------------------------
// Shared customer resolver (never trusts client-supplied IDs)
// -----------------------------------------------------------------------------

/**
 * Resolves the authenticated user's Stripe customer ID server-side via the
 * user-JWT-protected /me endpoint. Returns null for free-tier users with no
 * customer yet. Never trusts a client-supplied customerId (prevents IDOR).
 */
async function requireCustomerId(): Promise<string | null> {
  const me = await apiFetch<{ plan: { stripeCustomerId: string | null } }>(
    '/me',
    { pathTemplate: '/me' },
  )
  return me.plan.stripeCustomerId
}

// -----------------------------------------------------------------------------
// Live read: default payment method
// -----------------------------------------------------------------------------

/**
 * Live read of the customer's default card. Resolution order:
 *   invoice_settings.default_payment_method → first card on file → null.
 * Card data is never persisted — this is fetched per request.
 */
export const getPaymentMethodFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PaymentMethodView | null> => {
    await requireAuth()
    const customerId = await requireCustomerId()
    if (!customerId) return null

    const customer = await stripe().customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    })
    if ('deleted' in customer && customer.deleted) return null

    let pm = customer.invoice_settings?.default_payment_method ?? null
    if (typeof pm === 'string') {
      pm = await stripe().paymentMethods.retrieve(pm)
    }
    if (!pm) {
      const list = await stripe().paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      })
      pm = list.data[0] ?? null
    }
    if (!pm?.card) return null

    return {
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      wallet: pm.card.wallet?.type ?? null,
    }
  },
)

// -----------------------------------------------------------------------------
// Live read: billing details (email, tax IDs, address)
// -----------------------------------------------------------------------------

const EMPTY_DETAILS: BillingDetailsView = { email: null, taxIds: [], address: null }

/** Live read of customer billing details (read-only; edits go via Portal). */
export const getBillingDetailsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BillingDetailsView> => {
    await requireAuth()
    const customerId = await requireCustomerId()
    if (!customerId) return EMPTY_DETAILS

    const customer = await stripe().customers.retrieve(customerId, {
      expand: ['tax_ids'],
    })
    if ('deleted' in customer && customer.deleted) return EMPTY_DETAILS

    const taxIds = (customer.tax_ids?.data ?? []).map((t) => ({
      type: t.type,
      value: t.value ?? '',
    }))
    const a = customer.address
    return {
      email: customer.email,
      taxIds,
      address: a
        ? {
            line1: a.line1,
            line2: a.line2,
            city: a.city,
            state: a.state,
            postal: a.postal_code,
            country: a.country,
          }
        : null,
    }
  },
)

// -----------------------------------------------------------------------------
// Live read: invoice history
// -----------------------------------------------------------------------------

function toInvoiceView(inv: import('stripe').default.Invoice): InvoiceView {
  const cents = inv.amount_paid || inv.amount_due
  return {
    id: inv.id ?? '',
    number: inv.number ?? null,
    date: new Date(inv.created * 1000).toISOString(),
    amount: cents / 100,
    currency: inv.currency,
    status: inv.status ?? 'draft',
    invoicePdf: inv.invoice_pdf ?? null,
    hostedUrl: inv.hosted_invoice_url ?? null,
  }
}

/** Live read of the most recent 12 invoices for the user's customer. */
export const getInvoicesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<InvoiceView[]> => {
    await requireAuth()
    const customerId = await requireCustomerId()
    if (!customerId) return []
    const list = await stripe().invoices.list({ customer: customerId, limit: 12 })
    return list.data.map(toInvoiceView)
  },
)

// -----------------------------------------------------------------------------
// Create Checkout Session (Embedded UI, mode=subscription)
// -----------------------------------------------------------------------------

const CreateCheckoutInput = z.object({
  tier: z.enum(['pro', 'premium']),
})

export const createCheckoutSessionFn = createServerFn({ method: 'POST' })
  .inputValidator(CreateCheckoutInput)
  .handler(async ({ data }) => {
    enforceBillingRateLimit('checkout')
    const tierConfig = await apiFetch<TierConfig>('/tier-config', { pathTemplate: '/tier-config' }).catch(() => null)
    const priceId = priceIdForTierFromConfig(tierConfig, data.tier)
    const user    = await tryAuth()

    // Resolve the right `customer` parameter for the session:
    //   · Authenticated → ensure + reuse a single Stripe customer per user
    //   · Guest         → omit; Stripe collects email and creates a customer
    //                     at session completion (handled in the webhook)
    let customer: string | undefined
    if (user) {
      try {
        customer = await ensureStripeCustomerForUser(user)
      } catch (err) {
        logger.error(
          { event: 'stripe_customer_ensure_failed', userId: user.id, err },
          'ensureStripeCustomerForUser threw — falling back to guest-style checkout',
        )
        // Don't block the upgrade: webhook reconciliation will match by
        // metadata.userId / customer email at completion time.
      }
    }

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      // Stripe SDK 22 renamed 'embedded' → 'embedded_page'. The client-side
      // <EmbeddedCheckout/> still treats this as the embedded variant.
      ui_mode: 'embedded_page',
      line_items: [{ price: priceId, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} is a literal Stripe macro — do not interpolate.
      return_url: `${appOrigin()}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,

      ...(customer ? { customer } : {}),

      // `client_reference_id` is the top-level webhook lookup key. Cheaper
      // for the receiver than digging into metadata. Set for authenticated
      // sessions only — guest sessions are resolved via email later.
      ...(user ? { client_reference_id: user.id } : {}),

      automatic_tax: { enabled: false },

      // Belt + braces: duplicate userId/tier into metadata at session AND
      // subscription level. Subscription metadata survives across upgrades
      // and is read by `customer.subscription.updated` events.
      metadata: {
        tier: data.tier,
        ...(user ? { userId: user.id } : { source: 'guest' }),
      },
      subscription_data: {
        metadata: {
          tier: data.tier,
          ...(user ? { userId: user.id } : { source: 'guest' }),
        },
      },
    })

    if (!session.client_secret) {
      throw new Error(
        'Stripe did not return a client_secret for embedded checkout.',
      )
    }
    return { clientSecret: session.client_secret }
  })

// -----------------------------------------------------------------------------
// Read Checkout Session (after embedded form completes)
// -----------------------------------------------------------------------------

const GetCheckoutInput = z.object({ sessionId: z.string().startsWith('cs_') })

export const getCheckoutSessionFn = createServerFn({ method: 'GET' })
  .inputValidator(GetCheckoutInput)
  .handler(async ({ data }) => {
    const session = await stripe().checkout.sessions.retrieve(data.sessionId, {
      expand: ['line_items.data.price', 'subscription'],
    })

    // Derive tier from the line item price (more reliable than metadata if a
    // partner ever creates a session with a different code path).
    const tierConfig = await apiFetch<TierConfig>('/tier-config', { pathTemplate: '/tier-config' }).catch(() => null)
    let tier: PlanId | null = null
    const priceId = session.line_items?.data[0]?.price?.id
    if (priceId) tier = tierForPriceIdFromConfig(tierConfig, priceId)
    tier ??= (session.metadata?.tier as PlanId | undefined) ?? null

    return {
      status: session.status, // 'open' | 'complete' | 'expired'
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email ?? null,
      customerId:
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer?.id ?? null),
      tier,
    }
  })

// -----------------------------------------------------------------------------
// Create Billing Portal Session (admin: update PM, pay past-due, cancel)
// -----------------------------------------------------------------------------

const CreatePortalInput = z.object({
  customerId: z.string().startsWith('cus_'),
  /** Where to send the user after they close the portal. */
  returnPath: z.string().default('/billing'),
})

function safePortalReturnPath(returnPath: string): string {
  if (
    !returnPath.startsWith('/') ||
    returnPath.startsWith('//') ||
    /[\r\n]/.test(returnPath)
  ) {
    throw new Error('Invalid billing portal return path.')
  }
  return returnPath
}

export const createPortalSessionFn = createServerFn({ method: 'POST' })
  .inputValidator(CreatePortalInput)
  .handler(async ({ data }) => {
    enforceBillingRateLimit('billing_portal')
    const user = await requireAuth()
    const returnPath = safePortalReturnPath(data.returnPath ?? '/billing')
    const me = await apiFetch<{ plan: { stripeCustomerId: string | null } }>(
      '/me',
      { pathTemplate: '/me' },
    )

    if (!me.plan.stripeCustomerId || me.plan.stripeCustomerId !== data.customerId) {
      logger.warn(
        {
          event: 'stripe_portal_ownership_mismatch',
          userId: user.id,
          attemptedCustomer: data.customerId,
          ownedCustomer: me.plan.stripeCustomerId,
        },
        'billing portal ownership check failed — refusing to create session',
      )
      throw new Error('Stripe customer does not belong to the current user.')
    }

    const portal = await stripe().billingPortal.sessions.create({
      customer: data.customerId,
      return_url: `${appOrigin()}${returnPath}`,
    })
    return { url: portal.url }
  })

// -----------------------------------------------------------------------------
// Cancel / resume subscription (at period end)
// -----------------------------------------------------------------------------
//
// Cancellation is "at period end" — Stripe keeps the subscription active
// until current_period_end, then fires `customer.subscription.deleted`
// which the webhook converts to plan='free'. Until then the user keeps
// every paid feature.
//
// Resuming clears the flag if the user changes their mind before the
// period ends. Stripe charges them as normal on the renewal date.
//
// Both endpoints REQUIRE an authenticated session — there is no use case
// for guest cancellation. We additionally verify that the subscription
// belongs to the authenticated user's customer so a stolen sub_id from
// one user can't be cancelled by another.

const CancelInput = z.object({
  subscriptionId: z.string().startsWith('sub_'),
})

async function assertSubscriptionBelongsToUser(
  subscriptionId: string,
  userId: string,
): Promise<{ subscriptionId: string; customerId: string }> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId)
  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // Resolve the user's known customer ID via the existing /me endpoint
  // (under user JWT — no privileged lookups).
  const me = await apiFetch<{ plan: { stripeCustomerId: string | null } }>(
    '/me',
    { pathTemplate: '/me' },
  )
  if (!me.plan.stripeCustomerId || me.plan.stripeCustomerId !== customerId) {
    logger.warn(
      {
        event: 'stripe_cancel_ownership_mismatch',
        userId,
        attemptedSubscription: subscriptionId,
        attemptedCustomer: customerId,
        ownedCustomer: me.plan.stripeCustomerId,
      },
      'subscription ownership check failed — refusing to mutate',
    )
    throw new Error('Subscription does not belong to the current user.')
  }
  return { subscriptionId, customerId }
}

/**
 * Schedules the user's active subscription to cancel at the end of the
 * current billing period. Idempotent — calling twice leaves it scheduled.
 *
 * The webhook handler is the source of truth; this server fn additionally
 * does an optimistic write so the UI reflects the change immediately,
 * without waiting for Stripe's webhook round-trip.
 */
export const cancelSubscriptionFn = createServerFn({ method: 'POST' })
  .inputValidator(CancelInput)
  .handler(async ({ data }) => {
    const user = await requireAuth()
    const { customerId } = await assertSubscriptionBelongsToUser(
      data.subscriptionId,
      user.id,
    )

    const updated = await stripe().subscriptions.update(data.subscriptionId, {
      cancel_at_period_end: true,
    })
    // Stripe Subscription type exposes `current_period_end` directly on the
    // `items.data[0]` element in some API versions and at the top level in
    // others. Read the canonical top-level field first.
    const currentPeriodEnd = subscriptionPeriodEnd(updated)

    // Optimistic admin-api write so the next /me refresh is correct even if
    // the webhook is delayed.
    try {
      await internalApiFetch('/api/internal/billing/subscription', {
        method: 'PATCH',
        json: {
          customerId,
          cancelAtPeriodEnd: true,
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      })
    } catch (err) {
      // Non-fatal — webhook will reconcile. Log loudly so a sustained
      // outage of admin-api becomes visible.
      logger.warn(
        { event: 'stripe_cancel_optimistic_write_failed', userId: user.id, err },
        'optimistic cancel write to admin-api failed',
      )
    }

    return {
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
    }
  })

/**
 * Reverts a scheduled cancellation. Idempotent — calling on an
 * already-active subscription is a no-op.
 */
export const resumeSubscriptionFn = createServerFn({ method: 'POST' })
  .inputValidator(CancelInput)
  .handler(async ({ data }) => {
    const user = await requireAuth()
    const { customerId } = await assertSubscriptionBelongsToUser(
      data.subscriptionId,
      user.id,
    )

    const updated = await stripe().subscriptions.update(data.subscriptionId, {
      cancel_at_period_end: false,
    })
    const currentPeriodEnd = subscriptionPeriodEnd(updated)

    try {
      await internalApiFetch('/api/internal/billing/subscription', {
        method: 'PATCH',
        json: {
          customerId,
          cancelAtPeriodEnd: false,
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      })
    } catch (err) {
      logger.warn(
        { event: 'stripe_resume_optimistic_write_failed', userId: user.id, err },
        'optimistic resume write to admin-api failed',
      )
    }

    return {
      cancelAtPeriodEnd: false,
      currentPeriodEnd,
    }
  })

/**
 * Extracts `current_period_end` (unix seconds) from a Stripe Subscription
 * and returns it as ISO 8601, or null if absent.
 *
 * Stripe SDK 22 moved this field from the top-level Subscription to the
 * `items.data[*]` array — we check both to be robust against minor SDK
 * upgrades.
 */
function subscriptionPeriodEnd(sub: import('stripe').default.Subscription): string | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end
  const fromItem = sub.items.data[0]?.current_period_end
  const epoch = top ?? fromItem
  if (typeof epoch !== 'number') return null
  return new Date(epoch * 1000).toISOString()
}
