// src/server/stripe-webhook.ts
//
// Stripe webhook handler.
//
// Wired to a node-level POST route in `src/server/patches.ts` because
// `createServerFn` parses JSON before our code runs, which breaks Stripe's
// signature verification (it needs the raw body bytes).
//
// Events handled (subset that maps to business state changes):
//   · checkout.session.completed     → first subscription (auth or guest)
//   · customer.subscription.updated  → plan / status / quantity changes
//   · customer.subscription.deleted  → final cancellation
//   · invoice.paid                   → past_due → active
//   · invoice.payment_failed         → → past_due
//
// Resolution path: every event carries a `customer` ID. We map that to a
// local user via admin-api's `/api/internal/billing/users/by-customer/:id`.
//   · Match found  → PATCH /api/internal/billing/subscription
//   · No match     → POST  /api/internal/billing/pending (guest checkout
//                          parked until sign-up; see docs/billing-integration.md)
//
// See `docs/billing-integration.md` ("Webhook events handled").

import Stripe from 'stripe'
import { stripe, tierForPriceId } from './stripe'
import { internalApiFetch } from './_internal-api-client'
import { logger } from '@/lib/observability/logger'
import type { PlanId } from '@/features/account/types'

export interface WebhookContext {
  /** Raw request body bytes — required for signature verification. */
  rawBody: Buffer | string
  /** The `Stripe-Signature` HTTP header. */
  signature: string
}

// ─── Signature verification ──────────────────────────────────────────────────

function verifyEvent(ctx: WebhookContext): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.')
  try {
    return stripe().webhooks.constructEvent(ctx.rawBody, ctx.signature, secret)
  } catch (err) {
    // Invalid signature → 400, do NOT retry. Stripe re-sends with backoff
    // up to 24 h on 5xx; on 4xx it gives up. We want give-up here.
    throw new Error(
      `Webhook signature verification failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

// ─── Helpers: admin-api lookups ──────────────────────────────────────────────

interface UserByCustomer {
  user: { id: string; email: string } | null
}

async function findUserByCustomer(customerId: string): Promise<UserByCustomer['user']> {
  try {
    const res = await internalApiFetch<UserByCustomer>(
      `/api/internal/billing/users/by-customer/${encodeURIComponent(customerId)}`,
    )
    return res.user ?? null
  } catch (err) {
    // 404 → no user linked yet (guest checkout case). Return null without
    // raising — caller will fall through to the pending-row path.
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return null
    }
    throw err
  }
}

async function patchSubscription(
  customerId: string,
  patch: {
    plan?: PlanId
    stripeSubscriptionId?: string | null
    subscriptionStatus?: string | null
    cancelAtPeriodEnd?: boolean
    currentPeriodEnd?: string | null
  },
): Promise<void> {
  await internalApiFetch<{ updated: boolean }>(
    '/api/internal/billing/subscription',
    { method: 'PATCH', json: { customerId, ...patch } },
  )
}

async function recordPending(row: {
  email: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  plan: Exclude<PlanId, 'free'>
  subscriptionStatus: string
}): Promise<void> {
  await internalApiFetch<{ ok: true }>('/api/internal/billing/pending', {
    method: 'POST',
    json: row,
  })
}

// ─── Payment gate ────────────────────────────────────────────────────────────

/**
 * A checkout may complete WITHOUT a successful payment (unpaid, a $0 trial via
 * no_payment_required, or an incomplete session). Only grant a paid plan when
 * Stripe confirms the money landed; otherwise the later
 * customer.subscription.updated / invoice.paid events sync the user once
 * payment truly succeeds.
 */
export function shouldGrantFromCheckout(
  session: Pick<Stripe.Checkout.Session, 'payment_status' | 'status'>,
): boolean {
  return session.payment_status === 'paid' && session.status === 'complete'
}

// ─── Event-specific handlers ─────────────────────────────────────────────────

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Resolve user identity: client_reference_id (authenticated) wins.
  // metadata.userId is a fallback for sessions opened from server fns that
  // forgot to set the top-level field (defensive — current code sets both).
  const userId =
    session.client_reference_id ?? (session.metadata?.['userId'] as string | undefined)
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : (session.customer?.id ?? null)
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription?.id ?? null)
  const email = session.customer_details?.email ?? null
  const tier  = (session.metadata?.['tier'] as PlanId | undefined) ?? null

  if (!customerId || !subscriptionId || !tier) {
    logger.warn(
      {
        event: 'stripe_checkout_completed_incomplete',
        sessionId: session.id,
        customerId, subscriptionId, tier,
      },
      'checkout.session.completed missing customer/subscription/tier — ignoring',
    )
    return
  }

  if (!shouldGrantFromCheckout(session)) {
    logger.warn(
      {
        event: 'stripe_checkout_unpaid',
        sessionId: session.id,
        paymentStatus: session.payment_status,
        status: session.status,
      },
      'checkout.session.completed without confirmed payment - not granting plan; awaiting invoice.paid',
    )
    return
  }

  if (userId) {
    // Authenticated path. PATCH directly — customer is already linked at
    // pre-checkout time by ensureStripeCustomerForUser.
    await patchSubscription(customerId, {
      plan: tier,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: 'active',
    })
    logger.info(
      { event: 'stripe_checkout_completed', userId, customerId, tier },
      'authenticated subscription synced',
    )
    return
  }

  // Guest path. Drop a pending row keyed by email; user-provision
  // middleware drains it on sign-up.
  if (!email) {
    logger.warn(
      { event: 'stripe_checkout_guest_no_email', sessionId: session.id },
      'guest checkout completed with no email — cannot park for signup',
    )
    return
  }
  if (tier === 'free') return // defensive — free tier never hits checkout
  await recordPending({
    email,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    plan: tier as Exclude<PlanId, 'free'>,
    subscriptionStatus: 'active',
  })
  logger.info(
    { event: 'stripe_checkout_guest_parked', customerId, tier, hasEmail: true },
    'guest subscription parked pending signup',
  )
}

async function onSubscriptionChanged(sub: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const priceId = sub.items.data[0]?.price.id ?? null
  const tier = priceId ? tierForPriceId(priceId) : null

  // Stripe statuses we surface to UI verbatim (subset matched against
  // admin-api's CHECK constraint).
  const allowedStatuses = new Set([
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid',
  ])
  const status = allowedStatuses.has(sub.status) ? sub.status : null

  // For `deleted` events Stripe always sets status='canceled'. We collapse
  // back to the free plan so middleware quotas reset immediately, and clear
  // the cancellation flag (subscription no longer exists).
  const isDeleted = sub.status === 'canceled'
  const planPatch: PlanId | undefined = isDeleted ? 'free' : (tier ?? undefined)

  // Pull `current_period_end` from whichever surface the SDK exposes (top-level
  // in older API versions, items.data[0] in newer ones). See
  // src/server/billing.ts:subscriptionPeriodEnd for matching logic.
  const topPeriodEnd = (sub as unknown as { current_period_end?: number })
    .current_period_end
  const itemPeriodEnd = sub.items.data[0]?.current_period_end
  const periodEndSec = topPeriodEnd ?? itemPeriodEnd
  const currentPeriodEnd =
    typeof periodEndSec === 'number'
      ? new Date(periodEndSec * 1000).toISOString()
      : null

  await patchSubscription(customerId, {
    plan: planPatch,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: status,
    // Stripe always reports cancel_at_period_end; reflect it directly.
    // On a hard deletion event we reset the flag to false so a future
    // re-subscribe starts from a clean slate.
    cancelAtPeriodEnd: isDeleted ? false : Boolean(sub.cancel_at_period_end),
    currentPeriodEnd: isDeleted ? null : currentPeriodEnd,
  })

  logger.info(
    {
      event: 'stripe_subscription_synced',
      customerId,
      subscriptionId: sub.id,
      status: sub.status,
      tier,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd,
    },
    'subscription state synced from Stripe',
  )
}

async function onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null
  if (!customerId) return
  // Clear past_due if any was set; do not touch plan here.
  await patchSubscription(customerId, { subscriptionStatus: 'active' })
}

async function onInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null
  if (!customerId) return
  await patchSubscription(customerId, { subscriptionStatus: 'past_due' })
}

// ─── Top-level dispatch ──────────────────────────────────────────────────────

export async function handleStripeWebhook(ctx: WebhookContext): Promise<{
  received: true
}> {
  const event = verifyEvent(ctx)

  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
      break

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await onSubscriptionChanged(event.data.object as Stripe.Subscription)
      break

    case 'invoice.paid':
      await onInvoicePaid(event.data.object as Stripe.Invoice)
      break

    case 'invoice.payment_failed':
      await onInvoicePaymentFailed(event.data.object as Stripe.Invoice)
      break

    default:
      logger.info(
        { event: 'stripe_unhandled_event', type: event.type, id: event.id },
        '[stripe] event acknowledged but unhandled',
      )
  }

  // Reference unused in the no-op default branch so eslint doesn't flag it.
  void findUserByCustomer
  return { received: true }
}
