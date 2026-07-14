/**
 * @format
 * /api/internal/billing/* — service-to-service billing routes.
 *
 * Called by tucaken-app's Stripe webhook handler and pre-checkout flow with
 * a Cognito M2M (client_credentials) access token. The `m2m-auth` middleware
 * mounted by the parent app ensures the token carries the required scope.
 *
 * Routes are write-mostly: they mutate `users.stripe_*` columns and the
 * `pending_subscriptions` table. They are NEVER exposed to user JWTs — a
 * client must never set their own Stripe customer ID.
 *
 * See docs/billing-integration.md ("Webhook events handled") for the data
 * flow this router supports.
 */

import { Hono } from 'hono';
import { z, type ZodTypeAny } from 'zod';

import type { AdminApiConfig } from '../../lib/config.js';
import { logger } from '../../lib/observability/logger.js';
import { getPool } from '../../lib/pg.js';
import {
  setStripeCustomerId,
  findUserByStripeCustomerId,
  updateSubscriptionFromStripe,
  upsertPendingSubscription,
  UserNotFoundError,
  StripeCustomerConflictError,
} from '../../lib/repositories/users.js';
import { markWebhookEventSeen } from '../../lib/repositories/webhook-events.js';
import type { AdminApiBindings } from '../../lib/types.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const StripeCustomerLinkInput = z.object({
  userId:     z.string().uuid(),
  customerId: z.string().startsWith('cus_'),
});

const SubscriptionPatchInput = z.object({
  customerId:           z.string().startsWith('cus_'),
  plan:                 z.enum(['free', 'pro', 'premium']).optional(),
  stripeSubscriptionId: z.string().startsWith('sub_').nullable().optional(),
  subscriptionStatus:   z
    .enum(['active', 'trialing', 'past_due', 'canceled', 'unpaid'])
    .nullable()
    .optional(),
  cancelAtPeriodEnd:    z.boolean().optional(),
  /** ISO-8601 timestamp from Stripe's `current_period_end`. */
  currentPeriodEnd:     z.string().datetime({ offset: true }).nullable().optional(),
});

const PendingSubscriptionInput = z.object({
  email:                z.string().email(),
  stripeCustomerId:     z.string().startsWith('cus_'),
  stripeSubscriptionId: z.string().startsWith('sub_'),
  plan:                 z.enum(['pro', 'premium']),
  subscriptionStatus:   z.enum(['active', 'trialing', 'past_due', 'unpaid']),
});

const WebhookSeenInput = z.object({
  eventId: z.string().startsWith('evt_'),
  type:    z.string().min(1),
});

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Parse + zod-validate the JSON body, returning either the parsed value or a 400 Response. */
async function parseBody<T extends ZodTypeAny>(
  ctx: import('hono').Context,
  schema: T,
): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await ctx.req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', issues: result.error.issues }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return result.data;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function createInternalBillingRouter(
  config: AdminApiConfig,
): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();
  const pool = getPool(config);

  /**
   * POST /api/internal/billing/customers
   *
   * Idempotently links a Stripe customer ID to a user. Called by tucaken-app
   * after `stripe.customers.create()` so the customer record is reused on
   * the user's next checkout.
   */
  router.post('/customers', async (ctx) => {
    const parsed = await parseBody(ctx, StripeCustomerLinkInput);
    if (parsed instanceof Response) return parsed;
    const { userId, customerId } = parsed;
    try {
        await setStripeCustomerId(pool, userId, customerId);
      } catch (err) {
        // Not-found is RETRYABLE (provisioning may lag) → 404 so the webhook
        // rethrows and Stripe retries. A genuine conflict is a data anomaly the
        // caller should skip → 409. Anything else is unexpected → rethrow (500).
        if (err instanceof UserNotFoundError) {
          logger.warn(
            { event: 'stripe_customer_link_user_missing', userId, customerId },
            'setStripeCustomerId: user row not found — retryable',
          );
          return ctx.json({ error: err.message }, 404);
        }
        if (err instanceof StripeCustomerConflictError) {
          logger.warn(
            { event: 'stripe_customer_link_conflict', userId, customerId, existing: err.existingCustomerId },
            'setStripeCustomerId rejected — user already linked to a different customer',
          );
          return ctx.json({ error: err.message }, 409);
        }
        throw err;
      }
      logger.info(
        { event: 'stripe_customer_linked', userId, customerId },
        'Stripe customer linked to user',
      );
      return ctx.json({ ok: true });
  });

  /**
   * PATCH /api/internal/billing/subscription
   *
   * Applies a subscription state change to the user with the given Stripe
   * customer ID. Returns 404 if the customer isn't linked to any user
   * (which, for guest webhooks, means the caller should POST a pending row
   * instead — see /pending below).
   */
  router.patch('/subscription', async (ctx) => {
    const parsed = await parseBody(ctx, SubscriptionPatchInput);
    if (parsed instanceof Response) return parsed;
    const updated = await updateSubscriptionFromStripe(pool, parsed.customerId, {
      plan:                 parsed.plan,
      stripeSubscriptionId: parsed.stripeSubscriptionId,
      subscriptionStatus:   parsed.subscriptionStatus,
      cancelAtPeriodEnd:    parsed.cancelAtPeriodEnd,
      currentPeriodEnd:     parsed.currentPeriodEnd,
    });
    if (!updated) {
      logger.info(
        { event: 'stripe_subscription_no_user', customerId: parsed.customerId },
        'No user matched the Stripe customer ID — likely guest checkout pending sign-up',
      );
      return ctx.json({ updated: false }, 404);
    }
    logger.info(
      { event: 'stripe_subscription_updated', ...parsed },
      'Subscription state synced',
    );
    return ctx.json({ updated: true });
  });

  /**
   * GET /api/internal/billing/users/by-customer/:customerId
   *
   * Lookup for the webhook handler to decide if the event applies to a
   * known user (then PATCH /subscription) or a guest (then POST /pending).
   */
  router.get('/users/by-customer/:customerId', async (ctx) => {
    const customerId = ctx.req.param('customerId');
    if (!customerId.startsWith('cus_')) {
      return ctx.json({ error: 'Invalid customerId' }, 400);
    }
    const user = await findUserByStripeCustomerId(pool, customerId);
    if (!user) return ctx.json({ user: null }, 404);
    return ctx.json({ user });
  });

  /**
   * POST /api/internal/billing/pending
   *
   * Insert (or upsert by customer ID) a row in `pending_subscriptions`.
   * Drained at sign-up time by user-provision middleware.
   */
  router.post('/pending', async (ctx) => {
    const parsed = await parseBody(ctx, PendingSubscriptionInput);
    if (parsed instanceof Response) return parsed;
    await upsertPendingSubscription(pool, parsed);
    logger.info(
      {
        event: 'stripe_pending_recorded',
        customerId: parsed.stripeCustomerId,
        plan: parsed.plan,
        hasEmail: parsed.email.length > 0,
      },
      'Pending subscription recorded for guest signup',
    );
    return ctx.json({ ok: true });
  });

  /**
   * POST /api/internal/billing/webhook-seen
   *
   * Idempotency guard for the Stripe webhook. Claims an event id the first time
   * it is seen; returns { alreadyProcessed: true } on a duplicate delivery so
   * the caller can skip re-processing.
   */
  router.post('/webhook-seen', async (ctx) => {
    const parsed = await parseBody(ctx, WebhookSeenInput);
    if (parsed instanceof Response) return parsed;
    const isNew = await markWebhookEventSeen(pool, parsed.eventId, parsed.type);
    return ctx.json({ alreadyProcessed: !isNew });
  });

  return router;
}
