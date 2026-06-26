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
import { stripe, tierForPriceIdFromConfig } from './stripe'
import { apiFetch } from './_api-client'
import { internalApiFetch } from './_internal-api-client'
import { logger } from '@/lib/observability/logger'
import type { PlanId } from '@/features/account/types'
import type { TierConfig } from '@/features/billing/tier-config'

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

/** True when an InternalApiError (or any error carrying `status`) has `code`. */
function isStatus(err: unknown, code: number): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'status' in err &&
      (err as { status: number }).status === code,
  )
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
    if (isStatus(err, 404)) return null
    throw err
  }
}

/**
 * Idempotently link a user to their Stripe customer via admin-api. This is what
 * makes the webhook self-healing: even when the best-effort pre-checkout persist
 * (ensureStripeCustomerForUser) failed, the next event carrying the user
 * identity repairs the link before any subscription patch — so a paying user can
 * never be left with stripe_customer_id = null.
 *
 * `setStripeCustomerId` is idempotent (links when null, no-ops when already the
 * same id). Returns false ONLY on a 409 conflict — the user is already linked to
 * a DIFFERENT customer, a data anomaly we skip and leave for manual
 * reconciliation rather than overwrite. Transient errors are rethrown so Stripe
 * retries the event (at-least-once delivery -> eventual consistency).
 */
async function ensureCustomerLink(userId: string, customerId: string): Promise<boolean> {
  try {
    await internalApiFetch<{ ok: true }>('/api/internal/billing/customers', {
      method: 'POST',
      json: { userId, customerId },
    })
    return true
  } catch (err) {
    if (isStatus(err, 409)) {
      logger.error(
        { event: 'stripe_webhook_link_conflict', userId, customerId },
        'webhook customer link conflict — user already linked to a different Stripe customer; skipping sync for manual reconciliation',
      )
      return false
    }
    throw err
  }
}

/**
 * When the event carries a user identity, ensure the link before patching.
 * Returns true when it is safe to proceed (no identity to act on, or link
 * succeeded) and false when a 409 conflict means the caller should skip.
 */
async function linkIfIdentified(
  userId: string | undefined,
  customerId: string,
): Promise<boolean> {
  if (!userId) return true
  return ensureCustomerLink(userId, customerId)
}

/**
 * `current_period_end` as ISO 8601 (or null). Stripe SDK 22 moved this from the
 * top-level Subscription to `items.data[*]`; read whichever is present.
 */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end
  const item = sub.items.data[0]?.current_period_end
  const epoch = top ?? item
  return typeof epoch === 'number' ? new Date(epoch * 1000).toISOString() : null
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
    // Authenticated path. Self-heal the user<->customer link first (idempotent)
    // so a failed pre-checkout persist can't leave a paying user unlinked, then
    // PATCH the subscription. Skip on a 409 conflict (different customer).
    if (!(await ensureCustomerLink(userId, customerId))) return
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

  // Portal/renewal events also carry our userId in subscription metadata
  // (set at checkout via subscription_data.metadata). Self-heal the link so
  // these events sync even when the customer was never persisted. Skip on a
  // 409 conflict (customer already linked to a different user).
  const userId = sub.metadata?.['userId'] as string | undefined
  if (!(await linkIfIdentified(userId, customerId))) return

  const priceId = sub.items.data[0]?.price.id ?? null
  // Webhook runs with no user session; apiFetch will fail auth and fall back
  // to the env price→tier map inside tierForPriceIdFromConfig (known follow-up:
  // expose tier-config on an unauthenticated/internal read path).
  const tierConfig = await apiFetch<TierConfig>('/tier-config', { pathTemplate: '/tier-config' }).catch(() => null)
  const tier = priceId ? tierForPriceIdFromConfig(tierConfig, priceId) : null

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

  const currentPeriodEnd = periodEndIso(sub)

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

/**
 * Idempotency guard. Claims the event id via admin-api; returns true when this
 * is a duplicate delivery that should be skipped.
 *
 * Fails OPEN: if the dedupe call errors (table absent before the migration
 * lands, transient network), we return false and process the event anyway. The
 * conditional writes in the subscription sync remain the safety net — dropping
 * a real billing event would be worse than a rare reprocess.
 */
async function isDuplicateEvent(eventId: string, type: string): Promise<boolean> {
  try {
    const res = await internalApiFetch<{ alreadyProcessed: boolean }>(
      '/api/internal/billing/webhook-seen',
      { method: 'POST', json: { eventId, type } },
    )
    return res.alreadyProcessed
  } catch (err) {
    logger.warn(
      {
        event: 'stripe_dedupe_check_failed',
        id: eventId,
        type,
        err: err instanceof Error ? err.message : 'unknown',
      },
      '[stripe] webhook dedupe check failed — processing anyway (fail-open)',
    )
    return false
  }
}

export async function handleStripeWebhook(ctx: WebhookContext): Promise<{
  received: true
}> {
  const event = verifyEvent(ctx)

  if (await isDuplicateEvent(event.id, event.type)) {
    logger.info(
      { event: 'stripe_duplicate_event', id: event.id, type: event.type },
      '[stripe] duplicate event skipped',
    )
    return { received: true }
  }

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
