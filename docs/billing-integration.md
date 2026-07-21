# Stripe Billing Integration — Production Architecture

> Status: design + implementation reference. Last reviewed 2026-05-20.

This document records *how* Tucaken's subscription billing is wired between
Stripe, the TanStack Start frontend, and the admin-api BFF. Read it before
touching any of the files listed under "Surfaces" — the system has several
moving parts that must stay in lock-step.

---

## Surfaces

| File | Role |
| --- | --- |
| `src/server/stripe.ts` | Stripe SDK singleton + tier ↔ price ID lookup |
| `src/server/billing.ts` | `createCheckoutSessionFn`, `getCheckoutSessionFn`, `createPortalSessionFn` |
| `src/server/stripe-webhook.ts` | Webhook event handler (signature verify + admin-api dispatch) |
| `src/server/cognito-m2m.ts` | Service-account token client (Cognito client_credentials) |
| `src/server/_internal-api-client.ts` | admin-api fetcher using M2M token |
| `src/server/patches.ts` | Registers raw-body webhook route on the Node HTTP server |
| `src/features/billing/catalog.ts` | Tier catalogue shared by home / pricing / billing UI |
| `admin-api/src/middleware/m2m-auth.ts` | Cognito access-token middleware (scope-gated) |
| `admin-api/src/lib/repositories/users.ts` | Stripe column writes |
| `admin-api/src/routes/internal-billing.ts` | `/api/internal/billing/*` endpoints |
| `migrations/024_billing_pending_subscriptions.sql` | Guest-checkout race table |

---

## Identity model

A user is identified across three coordinate systems:

| System | ID | Source of truth |
| --- | --- | --- |
| Cognito | `sub` (uuid) | Cognito User Pool |
| admin-api / RDS | `users.id` (uuid) | RDS — provisioned on first `/api/admin/me` call from a JWT |
| Stripe | `customer.id` (`cus_…`) | Created at first checkout; persisted to `users.stripe_customer_id` |

The link between Stripe ↔ RDS is **`users.stripe_customer_id`** (unique
indexed in migration `007_reverse_trial.sql`). Every webhook event must
resolve `customer` → `users.id` through this column. The reverse link
(`users.id` → `customer.id`) is needed at checkout time so the same customer
record is reused across upgrades and never duplicated.

---

## Authenticated checkout flow (Dashboard → Billing → Upgrade)

```text
Browser                tucaken-app SSR              Stripe                admin-api
   │                          │                       │                       │
   │ POST createCheckoutSessionFn({ tier })           │                       │
   ├─────────────────────────►│                       │                       │
   │                          │ requireAuth() → userId│                       │
   │                          │ GET /me               │                       │
   │                          ├──────────────────────────────────────────────►│
   │                          │◄──────────────────────────────────────────────┤
   │                          │  { stripeCustomerId? }                        │
   │                          │                       │                       │
   │           if stripeCustomerId is null:           │                       │
   │                          │ stripe.customers.create({ email,              │
   │                          │   metadata: { userId } })                     │
   │                          ├──────────────────────►│                       │
   │                          │◄──────────────────────┤                       │
   │                          │ POST /internal/billing/customers              │
   │                          │   { userId, customerId }                      │
   │                          ├──────────────────────────────────────────────►│
   │                          │                                               │ UPDATE users SET stripe_customer_id = …
   │                          │                       │                       │
   │                          │ stripe.checkout.sessions.create({             │
   │                          │   mode: 'subscription',                       │
   │                          │   customer: cus_…,                            │
   │                          │   client_reference_id: userId,    ← belt+braces
   │                          │   metadata: { userId, tier },                 │
   │                          │   subscription_data: { metadata: { userId, tier } } })
   │                          ├──────────────────────►│                       │
   │                          │◄────────── client_secret                      │
   │◄─────────────────────────┤                                               │
   │                                                                          │
   │ <EmbeddedCheckout /> →   <iframe fields>  →   stripe.confirmPayment      │
   │                                                                          │
   │                                                  webhook: checkout.session.completed
   │                                                  POST /api/stripe/webhook │
   │                                                  ┌───────────────────────┴──┐
   │                                                  │ verify signature        │
   │                                                  │ resolve userId from     │
   │                                                  │   client_reference_id   │
   │                                                  │ POST /internal/billing/ │
   │                                                  │       subscription      │
   │                                                  └─►admin-api: UPDATE plan │
   │                                                                          │
   │ /checkout/return?session_id=cs_…                                        │
   │ Route renders "You're on Pro now" → /overview                            │
```

`client_reference_id` and `metadata.userId` are both set. We prefer
`client_reference_id` in the webhook because it's a top-level field and
costs nothing in event payload size; `metadata.userId` is a fallback for the
rare events where `client_reference_id` is absent (e.g. portal-initiated
changes).

---

## Guest checkout flow (Home `/pricing` → /checkout/$tier)

```text
Browser              tucaken-app SSR             Stripe              admin-api
   │                       │                       │                      │
   │ POST createCheckoutSessionFn({ tier })  (no auth)                    │
   ├──────────────────────►│                       │                      │
   │                       │ stripe.checkout.sessions.create({            │
   │                       │   customer_email omitted,                    │
   │                       │   metadata: { tier, source: 'guest' } })     │
   │                       ├──────────────────────►│                      │
   │                       │◄──── client_secret    │                      │
   │◄──────────────────────┤                                              │
   │                                                                      │
   │ payment succeeds                                                     │
   │                                                                      │
   │                                              webhook:                │
   │                                              checkout.session.completed
   │                                              tucaken-app extracts email
   │                                              POST /internal/billing/ │
   │                                                pending-link          │
   │                                              ┌──────────────────────►│
   │                                              │ INSERT INTO pending_subscriptions
   │                                              │   (email, customer_id, subscription_id, tier)
   │                                              └──────────────────────►│
   │                                                                      │
   │ /checkout/return → "Create your account"                            │
   │                                                                      │
   │ user submits sign-up                                                 │
   │                                                                      │
   │ Cognito provision → admin-api userProvision middleware:              │
   │   on insert, JOIN pending_subscriptions by email →                   │
   │   stamp stripe_customer_id + stripe_subscription_id + plan onto user │
   │   DELETE from pending_subscriptions                                  │
```

The pending-link table is **the** integrity guarantee for the guest path.
Without it, the webhook would arrive before the user row exists and we'd
either drop the event or write to a non-existent row.

---

## Webhook events handled

| Event | Action |
| --- | --- |
| `checkout.session.completed` | Authenticated → set `plan` + `subscription_id`. Guest → insert pending row. |
| `customer.subscription.updated` | Update `plan` (from `items[0].price.id` → tier) and `subscription_status`. |
| `customer.subscription.deleted` | Set `plan = 'free'`, `subscription_status = 'canceled'`. Keep `stripe_customer_id` for re-subscription. |
| `invoice.payment_failed` | Set `subscription_status = 'past_due'`. Surface banner on `/billing`. |
| `invoice.paid` | If currently `past_due`, set back to `active`. Idempotent. |

All other events are acknowledged (`200`) but not handled, so Stripe stops
retrying them. Add new handlers as the product needs them.

### Idempotency

Stripe replays webhooks on 5xx. Two guards:

1. **Stripe event ID dedup** — admin-api keeps a small `webhook_events_seen`
   audit table; on repeat we early-return `{ received: true }`.
2. **Conditional writes** — `UPDATE … WHERE subscription_id = $1 AND
   subscription_status IS DISTINCT FROM $2` avoids overwriting newer state
   with an older event that arrives out of order.

The audit table is live: `markWebhookEventSeen`
(`admin-api/src/lib/repositories/webhook-events.ts`) claims each event id via
`POST /api/internal/billing/webhook-seen` with an atomic
`INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING`; duplicates are
acknowledged and skipped. The check fails open — if the dedupe call errors,
the event is processed anyway and the conditional writes remain the safety
net. Table created by migration `108_webhook_events_seen.sql`
(platform-rds-bootstrap).

### Atomic provisioning (closed race window)

A previous version of this doc warned about a race where `upsertUser`
committed and a follow-up `consumePendingSubscriptionForUser` threw,
leaving a user with `plan='free'` even though Stripe was paid.

That race is **closed** by `provisionUserWithPendingLink(pool, profile)`
in `admin-api/src/lib/repositories/users.ts`. It opens one PoolClient,
runs the user upsert and the pending-link inside the same transaction,
and either COMMITs both or ROLLBACKs both. The sub→userId in-process
cache is set by middleware ONLY after the function returns successfully,
so any rollback path retries cleanly on the next request (upsertUser is
idempotent via `ON CONFLICT`).

The pending-link `UPDATE` is further guarded by `WHERE stripe_customer_id
IS NULL` so we never overwrite an already-linked customer; if a duplicate
pending row somehow exists for a linked user, we re-insert it for ops to
reconcile instead of silently swallowing.

---

## Service-to-service auth (Cognito M2M)

The webhook handler runs in the tucaken-app SSR pod and cannot forward a
user JWT (there is no user). We mint a service-account access token using
Cognito's `client_credentials` OAuth2 grant.

### Cognito objects

Created by `scripts/setup-cognito-m2m.ts`:

* **Resource server** — `resource_server_identifier = tucaken-internal`
  * Scope: `write:billing` — required for `/api/internal/billing/*`
* **App client** — `tucaken-app-service`
  * Type: confidential client (has client secret)
  * Allowed OAuth flows: `client_credentials`
  * Allowed OAuth scopes: `tucaken-internal/write:billing`

### Token lifecycle

* `cognito-m2m.ts` requests a token from
  `https://${COGNITO_DOMAIN}/oauth2/token` with `grant_type=client_credentials`
  and `scope=tucaken-internal/write:billing`.
* Tokens are valid 1h. We cache until `expires_at - 60s` and refresh on
  demand. No background refresh — first webhook after expiry pays the
  ~150ms cost.

### admin-api validation

`m2m-auth.ts` middleware in admin-api:

1. Verifies the JWT signature against the same JWKS as `cognitoJwtAuth`.
2. Requires `token_use === 'access'` (NOT `id`).
3. Requires `scope` claim to contain `tucaken-internal/write:billing`.
4. Sets `ctx.set('isServiceToken', true)`. No user-provision middleware
   runs (no user attached).

`/api/internal/*` is gated by m2m-auth and never by the user-JWT middleware.

---

## Tier ↔ price-ID resolution

Tier names live in `src/features/billing/catalog.ts`. Stripe price IDs live
in environment variables:

```bash
STRIPE_PRICE_PRO_MONTHLY=price_…
STRIPE_PRICE_PRO_ANNUAL=price_…
STRIPE_PRICE_PREMIUM_MONTHLY=price_…
STRIPE_PRICE_PREMIUM_ANNUAL=price_…
```

`src/server/stripe.ts:priceIdForTier(tier, interval)` does the mapping for
checkout creation. `tierForPriceId(priceId)` does the reverse for webhook
ingestion. Both error if the env is incomplete — boot fails fast.

---

## Env vars

| Var | Where used | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | tucaken-app server | `sk_test_…` in dev, `sk_live_…` in prod |
| `VITE_STRIPE_PUBLISHABLE_KEY` | tucaken-app client | exposed by Vite's `VITE_` prefix |
| `STRIPE_PRICE_*` | tucaken-app server | one per tier × interval |
| `STRIPE_WEBHOOK_SECRET` | tucaken-app server | from `stripe listen` locally, Dashboard endpoint in prod |
| `APP_ORIGIN` | tucaken-app server | absolute origin for `return_url` |
| `COGNITO_DOMAIN` | tucaken-app server | already set for user OAuth; reused for `/oauth2/token` |
| `COGNITO_M2M_CLIENT_ID` | tucaken-app server | created by setup script |
| `COGNITO_M2M_CLIENT_SECRET` | tucaken-app server | created by setup script |
| `COGNITO_M2M_SCOPE` | tucaken-app server | `tucaken-internal/write:billing` |
| `COGNITO_USER_POOL_ID` | admin-api | already configured |
| `M2M_RESOURCE_SERVER_ID` | admin-api | `tucaken-internal` |
| `M2M_REQUIRED_SCOPE` | admin-api | `tucaken-internal/write:billing` |

---

## Production deploy checklist

1. Run `scripts/setup-cognito-m2m.ts` once per environment — provisions
   resource server + app client, prints the client secret (only revealed
   once).
2. Apply migration `024_billing_pending_subscriptions.sql` against RDS.
3. Set all env vars from the table above on both tucaken-app and admin-api
   pods.
4. Add webhook endpoint in Stripe Dashboard pointing at
   `https://tucaken.io/api/stripe/webhook`. Copy signing secret into
   `STRIPE_WEBHOOK_SECRET`.
5. Enable events: `checkout.session.completed`,
   `customer.subscription.{updated,deleted}`, `invoice.{paid,payment_failed}`.
6. Smoke test: trigger one of each event with `stripe trigger` and confirm
   admin-api logs show the resulting `/api/internal/billing/*` calls.

---

## Local development

* `STRIPE_WEBHOOK_SECRET` from `stripe listen --forward-to localhost:5001/api/stripe/webhook`
* MOCK_AUTH bypasses Cognito on admin-api too — the M2M flow is **skipped**
  in dev-mock; webhook handler logs the would-be update instead of dispatching.
* Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0341`
  (attaches successfully but fails on first invoice — good for testing
  `payment_failed`).
