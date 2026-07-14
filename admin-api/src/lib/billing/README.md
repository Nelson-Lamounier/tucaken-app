# lib/billing

Plans, entitlements and tier configuration — the single source of truth for
what each plan may do, shared by every quota-enforcing surface (github
ingestion, strategist dispatch, project creation, public pricing).

## Files

| File | Purpose | Key exports |
|---|---|---|
| `entitlements.ts` | Central per-plan entitlements map + enrichment/analysis mode helpers | `entitlementsFromConfig` |
| `tier-config-shape.ts` | Zod schema + defaults for the tier-config DB row; `nullToInfinity` semantics (`null` = unlimited) | `TierConfigSchema`, `DEFAULT_TIER_CONFIG`, `nullToInfinity` |
| `tier-config-cache.ts` | In-process TTL cache over the tier-config row | `getCachedTierConfig`, `bustTierConfigCache` |
| `ab-free-tier.ts` | A/B free-tier email allowlist (`AB_FREE_TIER_EMAILS`) | pure gate |
| `enrichment-toggle.ts` | Enrichment-toggle email allowlist (`ENRICHMENT_TOGGLE_EMAILS`) | pure gate |

## How a quota check flows

1. Route reads the live tier config via `getCachedTierConfig` (DB-backed,
   cached in-process; `PUT /api/admin/tier-config` busts the cache).
2. `entitlementsFromConfig(config, plan)` resolves the caller's limits.
3. The enforcing surface (e.g. `checkAndIncrementQuota` in
   `routes/github/github-shared.ts`) applies them and returns 429 +
   Retry-After (`lib/retry-after.ts`) on exhaustion.

## Design notes

- `tier-config-shape.ts` mirrors the frontend's `billing/tier-config.ts` —
  change both together or the pricing surface lies.
- **Fail soft on async-synced config** (ADR 0006): a cache miss or stale row
  degrades to defaults, never to a hard failure.
- The allowlist gates are pure functions over env vars — no DB, no async —
  so they are safe in any context including middleware.
- Plan/subscription **writes** are not here: they live in
  `lib/repositories/users.ts` and are callable only from the M2M-gated
  internal-billing route (see the plan-write isolation guard test).

## Consumers

`routes/{github,projects,pipelines,billing,public,account}`,
`lib/jobs/ingestion-job.ts`, `scripts/reenrich-sweep.ts`.

## Testing

`__tests__/`: `entitlements.test.ts`, `tier-config-cache.test.ts`,
`tier-config-public.test.ts`, `ab-free-tier.test.ts`,
`enrichment-toggle.test.ts`.

## Related

- [lib overview](../README.md) · [routes/billing](../../routes/billing/README.md)
