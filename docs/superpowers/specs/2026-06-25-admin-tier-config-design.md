# Admin Tier Configuration — Design

Date: 2026-06-25
Branch: `feat/admin-tier-config`
Status: approved design, pre-implementation

## Goal

Give an admin user a Settings section to control the subscription tiers
(Free, Pro, Premium). Edits drive three layers from a single server source of
truth:

1. **Display** — public `/pricing`, home `PricingSection`, and the dashboard
   billing `PlanSection` (prices, blurbs, feature bullets, highlighted flag).
2. **Stripe mapping** — which existing Stripe price each paid tier maps to for
   checkout (and the webhook inverse lookup).
3. **Entitlements** — per-tier numeric limits (repos, projects, resumes/month,
   ingestion jobs/month, enrichment depth) enforced server-side in admin-api.

## Scope decisions (locked)

- **Full server source of truth** — config lives in RDS, owned by admin-api;
  all three layers read it. Not localStorage.
- **Monthly Stripe price only** — map `stripePriceIdMonthly` and wire monthly
  checkout only (matches today's env, which has only `*_MONTHLY`). Annual
  display price stays editable for the pricing toggle, but there is no annual
  Stripe price id field and no annual checkout this round.
- **Save + confirm dialog** — saving shows a confirm step warning that
  entitlement changes affect live user quotas immediately. No per-change audit
  row this round.

## Context (verified against code)

- admin-api is a **workspace inside this repo** (root + `admin-api/`), same
  worktree.
- Migrations live in a **different repo**:
  `ai-applications/applications/platform-rds-bootstrap/migrations`, named
  `NNN_name.sql`, tracked by a `schema_migrations` checksum ledger (editing an
  applied migration is rejected). The `104_tier_config.sql` file is a
  **separate PR in that repo**.
- Stripe SDK lives in **tucaken-app** (`src/server/stripe.ts`), not admin-api.
- Admin gate: frontend `me.plan.role === 'admin'`
  (`src/app/_dashboard.tsx:35`); backend `requireAdminGroup()` checks the
  Cognito `admin` group (`admin-api/src/middleware/auth.ts`).
- Entitlements are a static `ENTITLEMENTS` map
  (`admin-api/src/lib/entitlements.ts`); `role === 'admin'` already bypasses
  all limits. Quota enforced atomically in
  `admin-api/src/lib/repositories/users.ts`.
- Display catalog is a static `TIERS` const
  (`src/features/billing/catalog.ts`).
- Stripe price ids resolved from env via `priceIdForTier` /
  `tierForPriceId` (`src/server/stripe.ts:45`).
- Settings page sections use `Card` / `Field` / `Row` / `Toggle` primitives and
  a `PageSection` wrapper (`src/features/account/settings/*`,
  `src/features/account/components/`).

## 1. Data model

New migration `104_tier_config.sql` (platform-rds-bootstrap repo):

```sql
CREATE TABLE IF NOT EXISTS tier_config (
  id          SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config      JSONB        NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID         REFERENCES users(id)
);
```

Single-row table (`id = 1`). `config` holds all three tiers:

```ts
interface TierConfigEntry {
  id: 'free' | 'pro' | 'premium'
  name: string
  blurb: string
  cta: string
  highlighted: boolean
  free: boolean
  priceMonthly: number
  priceAnnual: number              // display only this round
  stripePriceIdMonthly: string | null   // null for free
  features: string[]
  entitlements: {
    repos: number | null           // null = unlimited
    projects: number | null
    resumesPerMonth: number | null
    ingestionJobsPerMonth: number | null
    enrichment: 'tier1' | 'full'
  }
}
type TierConfig = { tiers: TierConfigEntry[] }  // length 3, ordered free,pro,premium
```

- `Infinity` is not representable in JSON → **`null` = unlimited**; readers map
  `null` → `Infinity`.
- Static `TIERS` (display) and `ENTITLEMENTS` (limits) become the **seed +
  fallback** when the row is absent (pre-migration safety).

## 2. admin-api — read + write

- `admin-api/src/lib/repositories/tier-config.ts`:
  - `getTierConfig(pool): Promise<TierConfig>` — returns row or seeded default.
  - `upsertTierConfig(pool, config, userId)` — parameterised
    `INSERT ... ON CONFLICT (id) DO UPDATE`.
- `admin-api/src/routes/tier-config.ts` (Hono factory, mounted in
  `admin-api/src/index.ts`):
  - `GET /api/admin/tier-config` — any authed user (feeds display + checkout);
    returns DB config or seeded default.
  - `PUT /api/admin/tier-config` — `requireAdminGroup()`; zod-validates the full
    config server-side; writes; busts the cache.
- **Caching:** module-level cached read with ~60s TTL, busted on PUT, so the
  entitlements hot path adds no per-check DB hit.
- `entitlements.ts`: `entitlementsFor()` reads cached config (`null`→`Infinity`),
  falls back to static map if absent. Admin override unchanged.

## 3. tucaken-app server — Stripe + glue

- `src/server/tier-config.ts`:
  - `getTierConfigFn` — `createServerFn` GET, `requireAuth`, `apiFetch('/tier-config')`.
  - `updateTierConfigFn` — `createServerFn` POST, `requireAuth`, zod input,
    `apiFetch('/tier-config', { method: 'PUT', ... })` (admin enforced
    server-side by admin-api).
  - `listStripePricesFn` — `createServerFn` GET, admin-only, `stripe().prices.list()`
    (active prices) for the editor dropdown. On failure the UI falls back to a
    plain text price-id input.
- `src/server/stripe.ts`: `priceIdForTier` / `tierForPriceId` read the fetched
  config; env vars kept as last-resort fallback so nothing breaks before the
  migration lands.
- `src/features/billing/catalog.ts`: add `tiersFromConfig(config): Tier[]`
  mapper; `TIERS` stays as the fallback constant. Pricing/billing UIs consume
  config via query, fallback to `TIERS`.

## 4. Frontend — admin Settings section

- `src/features/account/settings/TierConfigSection.tsx`:
  - Built from `Card` / `Field` / `Row` / `Toggle` primitives + a per-tier
    sub-editor: display fields (name, blurb, cta, prices, highlighted, features
    list), Stripe price dropdown (from `listStripePricesFn`, text fallback),
    entitlement number inputs each with an "Unlimited" toggle (toggle on →
    value `null`), enrichment select (`tier1` / `full`).
  - Loads via TanStack Query (`getTierConfigFn` + `listStripePricesFn`).
  - Saves via `useMutation` → `updateTierConfigFn`, gated behind a **confirm
    dialog** warning that entitlement changes affect live user quotas
    immediately. On success invalidates the `me` and tier-config queries.
- `src/features/account/settings/SettingsPage.tsx`:
  - New `PageSection id="tiers"` ("Subscription tiers"), `CreditCard` icon,
    **rendered only when `me.plan.role === 'admin'`**; `SECTIONS` entry added
    conditionally so the table-of-contents matches.
- Complexity kept ≤ 10 per function (extract per-tier and per-field render
  helpers); no nested ternaries (guard returns); stable keys from `tier.id`.

## 5. Validation / safety

- One shared zod schema for `TierConfig`, validated server-side on PUT (never
  trust client). Guards: `priceMonthly`/`priceAnnual` ≥ 0; entitlement values
  are integer ≥ 0 or `null`; `free` tier has `stripePriceIdMonthly === null`
  and `free === true`; non-free tiers require a non-null `stripePriceIdMonthly`;
  exactly the three tier ids present.
- Non-admin PUT → 403 via `requireAdminGroup`. UI gate is cosmetic only.
- All copy UK English; product name "Tucaken"; `rounded-md` default radius;
  `crypto.randomUUID()` if any id needed; Pino logging, no `console.*`.

## 6. Tests (Vitest, colocated)

- `entitlements`: config-row overrides static; `null`→`Infinity`; fallback when
  row absent; admin override still wins.
- `tier-config` repo: upsert/read round-trip; single-row constraint enforced.
- zod schema: rejects negative price; free tier with a price id; non-free
  without price id; wrong tier-id set.
- catalog mapper: `tiersFromConfig` produces correct `Tier` shape; falls back to
  `TIERS` on null.

## Deliverables / rollout

- **This worktree (`feat/admin-tier-config`)**: tucaken-app + admin-api code +
  tests.
- **Separate PR in `platform-rds-bootstrap`**: `104_tier_config.sql`.
- Until the migration lands, all paths fall back to current static/env
  behaviour — safe to merge the app code first.

## Out of scope (YAGNI this round)

- Annual Stripe checkout / annual price id.
- Per-change audit log of tier_config edits.
- Creating new Stripe Price objects from the UI (only map to existing).
- Adding/removing tiers (fixed set: free, pro, premium).
