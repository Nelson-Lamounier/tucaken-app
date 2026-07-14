# billing

Everything money-shaped: Stripe subscription sync, plan/tier configuration,
cost reporting and LLM usage budgets. Three auth tiers meet in this folder —
read the mount table carefully before adding a route.

## Files

| File | Exports | Mount | Tier |
|---|---|---|---|
| `internal-billing.ts` | `createInternalBillingRouter` | `/api/internal/billing` | **M2M only** (`cognitoM2MAuth`, scope `tucaken-internal/write:billing`) |
| `tier-config.ts` | `createTierConfigRouter` | `/api/admin/tier-config` | staff |
| `finops.ts` | `createFinopsRouter` | `/api/admin/finops` | staff |
| `bedrock-usage.ts` | `createBedrockUsageRouter` | `/api/admin/bedrock-usage` | staff |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/billing/customers` | Record Stripe customer id for a user |
| PATCH | `/internal/billing/subscription` | Sync subscription state from a Stripe webhook |
| GET | `/internal/billing/users/by-customer/:customerId` | Reverse lookup for webhook handling |
| POST | `/internal/billing/pending` | Mark a pending billing transition |
| POST | `/internal/billing/webhook-seen` | Webhook idempotency ledger |
| GET/PUT | `/admin/tier-config` | Read / replace the live tier configuration |
| GET | `/admin/finops/{realtime,costs,chatbot,self-healing}` | Cost + ops reporting |
| GET | `/admin/bedrock-usage/summary` | LLM token usage summary |
| GET/PUT | `/admin/bedrock-usage/budget/:userId` | Per-user Bedrock budget |

## Security invariant — plan-write isolation

`internal-billing.ts` is the **only** route file allowed to reference the
plan/subscription mutators (`updateSubscriptionFromStripe`,
`setStripeCustomerId`). It sits behind the M2M tier and is never reachable
with a user JWT. This is enforced by a guard test,
[`lib/__tests__/plan-write-isolation.test.ts`](../../lib/__tests__/plan-write-isolation.test.ts),
which scans every route file recursively — if you legitimately need a new
plan writer, extend that test deliberately, never casually.

## Design notes

- Tier config is a single DB row validated by
  [`lib/billing/tier-config-shape.ts`](../../lib/billing/README.md) (Zod) and
  served through a small in-process TTL cache (`tier-config-cache.ts`);
  `PUT /tier-config` busts the cache.
- Webhook idempotency lives in `lib/repositories/webhook-events.ts` — Stripe
  retries must never double-apply a transition.

## Testing

`__tests__/tier-config.test.ts` here; plan-write isolation and repository
tests under `lib/`.

## Related

- [routes overview](../README.md) · [lib/billing](../../lib/billing/README.md) · `docs/billing-integration.md`
