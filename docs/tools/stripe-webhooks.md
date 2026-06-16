---
title: Stripe webhooks — subscription state sync
type: tool
tags: [stripe, webhooks, billing, subscriptions, idempotency]
sources:
  - src/server/stripe-webhook.ts
  - src/server/patches.ts
created: 2026-06-16
updated: 2026-06-16
---

## What it does

Stripe webhooks are how billing state in Stripe becomes subscription state in
the app. A signed POST from Stripe is verified, mapped to a local user via the
event's `customer` id, and translated into a plan/status change persisted through
admin-api's internal billing API. The handler covers the subset of events that
map to a business state change: first subscription, plan/status changes,
cancellation, and the invoice events that move a user between `active` and
`past_due` ([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L9-L20)).

## How it is configured

The handler is wired to a **node-level** POST route in
[src/server/patches.ts](../../src/server/patches.ts), deliberately not through
`createServerFn`, because `createServerFn` parses JSON before user code runs and
that destroys the raw body bytes Stripe's signature verification needs
([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L1-L7)). Verification uses
`stripe().webhooks.constructEvent(rawBody, signature, secret)` with the
`STRIPE_WEBHOOK_SECRET` env var; a missing secret throws, and an invalid
signature throws so the route returns 4xx
([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L39-L53)). The
`WebhookContext` carries the raw body buffer and the `Stripe-Signature` header
([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L30-L35)).

## How it integrates with the rest of the system

Every event resolves a local user from its `customer` id by calling admin-api at
`/api/internal/billing/users/by-customer/:id` (authenticated with the Cognito M2M
token — see [Cognito JWT verification](../concepts/cognito-jwks-verification.md)).
A match is updated with `PATCH /api/internal/billing/subscription`; an unmatched
guest checkout is parked with `POST /api/internal/billing/pending`, which the
user-provision middleware drains on sign-up
([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L16-L20),
[#L152-L172](../../src/server/stripe-webhook.ts#L152-L172)). The top-level
dispatch switches on `event.type` and acknowledges unknown events as a no-op
([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L256-L289)).

## Failure modes

- **Invalid signature** → the handler throws and the route returns 4xx. This is
  intentional: Stripe retries with backoff up to 24h on 5xx but gives up on 4xx,
  and a bad signature should not be retried
  ([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L45-L52)).
- **Incomplete `checkout.session.completed`** (missing customer/subscription/tier)
  → logged at warn and ignored rather than written
  ([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L125-L135)).
- **Guest checkout with no email** → cannot be parked for sign-up; logged at warn
  ([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L154-L160)).
- **No user linked yet** → `findUserByCustomer` treats a 404 from admin-api as
  "guest, not an error" and returns null
  ([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L67-L74)).

## Operational notes

Subscription-change handling normalises Stripe quirks: only statuses in an
allow-list (`active`, `trialing`, `past_due`, `canceled`, `unpaid`) are surfaced
to match admin-api's CHECK constraint, a `deleted` event collapses the user back
to the `free` plan so quota resets immediately, and `current_period_end` is read
from whichever surface the SDK exposes (top-level on older API versions,
`items.data[0]` on newer)
([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L182-L218)). `invoice.paid`
clears `past_due` to `active` without touching the plan, and
`invoice.payment_failed` sets `past_due`
([stripe-webhook.ts](../../src/server/stripe-webhook.ts#L235-L251)).

## Deeper detail

- [docs/billing-integration.md](../billing-integration.md) — full billing
  architecture, the webhook event table, and the guest-checkout pending flow.
- [Cognito JWT verification — user and service (M2M) tokens](../concepts/cognito-jwks-verification.md)
  — how the webhook authenticates to admin-api's internal API.

<!--
Evidence trail (auto-generated):
- Source: src/server/stripe-webhook.ts (read on 2026-06-16, full file 1-289)
- Source: src/server/patches.ts (referenced for node-level route wiring; per stripe-webhook.ts header)
-->
