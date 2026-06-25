# Admin Tier Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin edit Free/Pro/Premium tiers (display copy, Stripe price mapping, entitlement limits) from a Settings section, persisted to a single RDS row that drives display, checkout, and server-side quota gating.

**Architecture:** A single-row `tier_config` JSONB table in RDS is owned by admin-api. admin-api exposes `GET` (any authed user) and `PUT` (admin-only) plus a cached reader the entitlements hot path uses. tucaken-app reads the config via a server fn for the public catalog, checkout price mapping, and webhook inverse lookup, and renders an admin-only `TierConfigSection`. Static `TIERS`/`ENTITLEMENTS` remain the seed + fallback so the app is safe before the migration lands.

**Tech Stack:** TanStack Start (`createServerFn`), TanStack Query, Hono (admin-api), `pg`, Zod, Stripe SDK, Vitest, Tailwind v4.

## Global Constraints

- Yarn 4 only (`yarn <script>`, `yarn workspace admin-api ...`). Never npm/npx.
- Before "done": `yarn typecheck && yarn lint && yarn test` (zero errors).
- ESLint cyclomatic complexity ≤ 10 per function. No nested ternaries (`S3358`) — use guard returns. No `as any`. `Number.parseInt`/`Number.isNaN` not globals. `Set.has()` for allow-lists. Stable React keys from `tier.id`, never index. `crypto.randomUUID()` not `Math.random()`. No `console.*` in app code — use Pino.
- All prose/copy UK English. Product name "Tucaken". Generated doc term is "resume".
- Default corner radius `rounded-md` for new components.
- Zod-validate every server boundary. Never trust client payloads. Admin enforced server-side (`requireAdminGroup`), UI gate is cosmetic.
- New routes elsewhere are directory-based, but Settings sections follow the existing flat `src/features/account/settings/*` pattern — match it.
- All work in worktree `feat/admin-tier-config` (`../tucaken-app-wt-admin-tier-config`). Migration file is a **separate repo/PR** — see Task 9.

---

## File structure

Shared config type + zod (single source, imported by both app and admin-api):
- Create `src/features/billing/tier-config.ts` — `TierConfig` types, `TierConfigSchema` (zod), `DEFAULT_TIER_CONFIG` (seed from `TIERS`/`ENTITLEMENTS`), `nullToInfinity`/`infinityToNull` helpers.

admin-api:
- Create `admin-api/src/lib/repositories/tier-config.ts` — repo (`getTierConfigRow`, `upsertTierConfig`).
- Create `admin-api/src/lib/tier-config-cache.ts` — cached reader + bust.
- Create `admin-api/src/routes/tier-config.ts` — Hono router (`GET`/`PUT`).
- Modify `admin-api/src/index.ts` — mount router.
- Modify `admin-api/src/lib/entitlements.ts` — read cached config.

tucaken-app server:
- Create `src/server/tier-config.ts` — `getTierConfigFn`, `updateTierConfigFn`, `listStripePricesFn`.
- Modify `src/server/stripe.ts` — `priceIdForTier`/`tierForPriceId` read config (env fallback).
- Modify `src/features/billing/catalog.ts` — `tiersFromConfig` mapper.

Frontend:
- Create `src/features/account/settings/TierConfigSection.tsx` — admin editor.
- Modify `src/features/account/settings/SettingsPage.tsx` — conditional admin section.

Migration (separate repo):
- Create `ai-applications/.../platform-rds-bootstrap/migrations/104_tier_config.sql`.

---

### Task 1: Shared tier-config types, schema, and seed default

**Files:**
- Create: `src/features/billing/tier-config.ts`
- Test: `src/features/billing/__tests__/tier-config.test.ts`

**Interfaces:**
- Consumes: `TIERS` from `src/features/billing/catalog.ts`; `PlanId` from `src/features/account/types.ts`.
- Produces:
  - `interface TierEntitlements { repos: number | null; projects: number | null; resumesPerMonth: number | null; ingestionJobsPerMonth: number | null; enrichment: 'tier1' | 'full' }`
  - `interface TierConfigEntry { id: PlanId; name: string; blurb: string; cta: string; highlighted: boolean; free: boolean; priceMonthly: number; priceAnnual: number; stripePriceIdMonthly: string | null; features: string[]; entitlements: TierEntitlements }`
  - `interface TierConfig { tiers: TierConfigEntry[] }`
  - `const TierConfigSchema: z.ZodType<TierConfig>`
  - `const DEFAULT_TIER_CONFIG: TierConfig`
  - `function nullToInfinity(v: number | null): number`
  - `function infinityToNull(v: number): number | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/billing/__tests__/tier-config.test.ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIER_CONFIG,
  TierConfigSchema,
  nullToInfinity,
  infinityToNull,
} from '../tier-config'

describe('tier-config schema', () => {
  it('accepts the seed default', () => {
    expect(TierConfigSchema.parse(DEFAULT_TIER_CONFIG)).toEqual(DEFAULT_TIER_CONFIG)
  })

  it('rejects a negative price', () => {
    const bad = structuredClone(DEFAULT_TIER_CONFIG)
    bad.tiers[1].priceMonthly = -1
    expect(() => TierConfigSchema.parse(bad)).toThrow()
  })

  it('rejects the free tier carrying a Stripe price id', () => {
    const bad = structuredClone(DEFAULT_TIER_CONFIG)
    bad.tiers[0].stripePriceIdMonthly = 'price_x'
    expect(() => TierConfigSchema.parse(bad)).toThrow()
  })

  it('rejects a non-free tier with no Stripe price id', () => {
    const bad = structuredClone(DEFAULT_TIER_CONFIG)
    bad.tiers[1].stripePriceIdMonthly = null
    expect(() => TierConfigSchema.parse(bad)).toThrow()
  })

  it('rejects a wrong tier-id set', () => {
    const bad = structuredClone(DEFAULT_TIER_CONFIG)
    bad.tiers[2].id = 'free'
    expect(() => TierConfigSchema.parse(bad)).toThrow()
  })

  it('maps null<->Infinity', () => {
    expect(nullToInfinity(null)).toBe(Number.POSITIVE_INFINITY)
    expect(nullToInfinity(5)).toBe(5)
    expect(infinityToNull(Number.POSITIVE_INFINITY)).toBeNull()
    expect(infinityToNull(5)).toBe(5)
  })

  it('seed default has free, pro, premium in order', () => {
    expect(DEFAULT_TIER_CONFIG.tiers.map((t) => t.id)).toEqual(['free', 'pro', 'premium'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/features/billing/__tests__/tier-config.test.ts`
Expected: FAIL — cannot find module `../tier-config`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/billing/tier-config.ts
//
// Single source of truth for the editable tier configuration shape.
// Shared by tucaken-app (catalog, checkout, admin editor) and admin-api
// (entitlements, persistence). JSON cannot hold Infinity, so unlimited
// entitlements are encoded as `null` and mapped to Infinity at read time.

import { z } from 'zod'
import type { PlanId } from '@/features/account/types'
import { TIERS } from '@/features/billing/catalog'

export interface TierEntitlements {
  repos: number | null
  projects: number | null
  resumesPerMonth: number | null
  ingestionJobsPerMonth: number | null
  enrichment: 'tier1' | 'full'
}

export interface TierConfigEntry {
  id: PlanId
  name: string
  blurb: string
  cta: string
  highlighted: boolean
  free: boolean
  priceMonthly: number
  priceAnnual: number
  stripePriceIdMonthly: string | null
  features: string[]
  entitlements: TierEntitlements
}

export interface TierConfig {
  tiers: TierConfigEntry[]
}

const TIER_IDS = ['free', 'pro', 'premium'] as const

const limit = z.union([z.number().int().nonnegative(), z.null()])

const entitlementsSchema = z.object({
  repos: limit,
  projects: limit,
  resumesPerMonth: limit,
  ingestionJobsPerMonth: limit,
  enrichment: z.enum(['tier1', 'full']),
})

const entrySchema = z.object({
  id: z.enum(TIER_IDS),
  name: z.string().min(1),
  blurb: z.string(),
  cta: z.string().min(1),
  highlighted: z.boolean(),
  free: z.boolean(),
  priceMonthly: z.number().nonnegative(),
  priceAnnual: z.number().nonnegative(),
  stripePriceIdMonthly: z.union([z.string().min(1), z.null()]),
  features: z.array(z.string()),
  entitlements: entitlementsSchema,
})

export const TierConfigSchema = z
  .object({ tiers: z.array(entrySchema) })
  .superRefine((cfg, ctx) => {
    const ids = cfg.tiers.map((t) => t.id)
    const wanted = new Set<string>(TIER_IDS)
    if (ids.length !== TIER_IDS.length || !ids.every((id) => wanted.has(id))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tiers must be exactly free, pro, premium' })
    }
    for (const t of cfg.tiers) {
      if (t.free && t.stripePriceIdMonthly !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `free tier ${t.id} must not have a Stripe price id` })
      }
      if (!t.free && t.stripePriceIdMonthly === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `paid tier ${t.id} requires a Stripe price id` })
      }
    }
  }) as z.ZodType<TierConfig>

const ENTITLEMENT_SEED: Record<PlanId, TierEntitlements> = {
  free: { repos: 1, projects: 1, resumesPerMonth: 1, ingestionJobsPerMonth: 3, enrichment: 'tier1' },
  pro: { repos: null, projects: null, resumesPerMonth: null, ingestionJobsPerMonth: null, enrichment: 'tier1' },
  premium: { repos: null, projects: null, resumesPerMonth: null, ingestionJobsPerMonth: null, enrichment: 'full' },
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  tiers: TIERS.map((t) => ({
    id: t.id,
    name: t.name,
    blurb: t.blurb,
    cta: t.cta,
    highlighted: Boolean(t.highlighted),
    free: Boolean(t.free),
    priceMonthly: t.priceMonthly,
    priceAnnual: t.priceAnnual,
    stripePriceIdMonthly: t.free ? null : 'price_seed_placeholder',
    features: [...t.features],
    entitlements: ENTITLEMENT_SEED[t.id],
  })),
}

export function nullToInfinity(v: number | null): number {
  return v === null ? Number.POSITIVE_INFINITY : v
}

export function infinityToNull(v: number): number | null {
  return Number.isFinite(v) ? v : null
}
```

Note: the `'price_seed_placeholder'` only exists if the DB row is absent AND code calls a paid checkout before an admin saves real ids — the env fallback in Task 6 covers real checkout. The seed satisfies the schema's "paid tier needs an id" rule.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/features/billing/__tests__/tier-config.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
yarn typecheck
git add src/features/billing/tier-config.ts src/features/billing/__tests__/tier-config.test.ts
git commit -m "feat(billing): shared tier-config schema, seed default and helpers"
```

---

### Task 2: Catalog mapper `tiersFromConfig`

**Files:**
- Modify: `src/features/billing/catalog.ts`
- Test: `src/features/billing/__tests__/catalog-mapper.test.ts`

**Interfaces:**
- Consumes: `TierConfig` from `src/features/billing/tier-config.ts`; existing `Tier`, `TIERS`.
- Produces: `function tiersFromConfig(config: TierConfig | null | undefined): readonly Tier[]` — maps config → display `Tier[]`, returns `TIERS` when config is null.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/billing/__tests__/catalog-mapper.test.ts
import { describe, expect, it } from 'vitest'
import { tiersFromConfig, TIERS } from '../catalog'
import { DEFAULT_TIER_CONFIG } from '../tier-config'

describe('tiersFromConfig', () => {
  it('falls back to TIERS when config is null', () => {
    expect(tiersFromConfig(null)).toBe(TIERS)
  })

  it('maps config entries into Tier display shape', () => {
    const out = tiersFromConfig(DEFAULT_TIER_CONFIG)
    expect(out.map((t) => t.id)).toEqual(['free', 'pro', 'premium'])
    expect(out[1].name).toBe('Pro')
    expect(out[1].priceMonthly).toBe(DEFAULT_TIER_CONFIG.tiers[1].priceMonthly)
    expect(out[0].free).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/features/billing/__tests__/catalog-mapper.test.ts`
Expected: FAIL — `tiersFromConfig` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/features/billing/catalog.ts`, after `formatPrice`)

```ts
import type { TierConfig } from '@/features/billing/tier-config'

/**
 * Map the persisted tier config into the display `Tier[]` the pricing and
 * billing UIs consume. Returns the static `TIERS` when no config is present.
 */
export function tiersFromConfig(config: TierConfig | null | undefined): readonly Tier[] {
  if (!config) return TIERS
  return config.tiers.map((t) => ({
    id: t.id,
    name: t.name,
    priceMonthly: t.priceMonthly,
    priceAnnual: t.priceAnnual,
    blurb: t.blurb,
    features: [...t.features],
    cta: t.cta,
    highlighted: t.highlighted || undefined,
    free: t.free || undefined,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/features/billing/__tests__/catalog-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
yarn typecheck
git add src/features/billing/catalog.ts src/features/billing/__tests__/catalog-mapper.test.ts
git commit -m "feat(billing): map persisted tier config into display Tier[]"
```

---

### Task 3: admin-api tier-config repository

**Files:**
- Create: `admin-api/src/lib/repositories/tier-config.ts`
- Test: `admin-api/src/lib/repositories/__tests__/tier-config.test.ts`

**Interfaces:**
- Consumes: `pg` `Pool`/`Queryable` (match existing repo signature `Pick<Pool, 'query'>` used in `users.ts`); `TierConfig`, `TierConfigSchema`, `DEFAULT_TIER_CONFIG` from the app package — **import path:** these live in tucaken-app `src/features/billing/tier-config.ts`. admin-api is a separate tsconfig; **copy the shared module into admin-api** at `admin-api/src/lib/tier-config-shape.ts` re-exporting the same zod schema (admin-api cannot import from the app `src/`). The repo imports from that local copy.
- Produces:
  - `function getTierConfigRow(db: Queryable): Promise<TierConfig | null>` — parsed config or null if no row.
  - `function upsertTierConfig(db: Queryable, config: TierConfig, userId: string): Promise<void>`.

- [ ] **Step 1: Create the admin-api-local shared shape copy**

Create `admin-api/src/lib/tier-config-shape.ts` with the **exact** contents of `src/features/billing/tier-config.ts` from Task 1, except:
- Replace the two app imports (`PlanId`, `TIERS`) with a local `PlanId` alias and an inlined seed:

```ts
// admin-api/src/lib/tier-config-shape.ts
// Mirror of tucaken-app src/features/billing/tier-config.ts — admin-api has a
// separate tsconfig and cannot import from the app source tree. Keep in sync.
import { z } from 'zod'

export type PlanId = 'free' | 'pro' | 'premium'
// ... paste TierEntitlements, TierConfigEntry, TierConfig, schema, helpers
// verbatim from Task 1, and inline DEFAULT_TIER_CONFIG using the literal
// display values from src/features/billing/catalog.ts TIERS (free/pro/premium
// names, blurbs, ctas, prices, features) plus ENTITLEMENT_SEED.
```

(Include the full literal `DEFAULT_TIER_CONFIG` — copy display strings from `src/features/billing/catalog.ts` `TIERS`.)

- [ ] **Step 2: Write the failing test**

```ts
// admin-api/src/lib/repositories/__tests__/tier-config.test.ts
import { describe, expect, it, vi } from 'vitest'
import { getTierConfigRow, upsertTierConfig } from '../tier-config'
import { DEFAULT_TIER_CONFIG } from '../../tier-config-shape'

function fakeDb(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) }
}

describe('tier-config repository', () => {
  it('returns null when no row exists', async () => {
    const db = fakeDb([])
    expect(await getTierConfigRow(db)).toBeNull()
  })

  it('parses a stored config row', async () => {
    const db = fakeDb([{ config: DEFAULT_TIER_CONFIG }])
    expect(await getTierConfigRow(db)).toEqual(DEFAULT_TIER_CONFIG)
  })

  it('upserts a single row with id=1 and userId', async () => {
    const db = fakeDb([])
    await upsertTierConfig(db, DEFAULT_TIER_CONFIG, 'user-123')
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO tier_config')
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE')
    expect(params[0]).toBe(JSON.stringify(DEFAULT_TIER_CONFIG))
    expect(params[1]).toBe('user-123')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn workspace admin-api test src/lib/repositories/__tests__/tier-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// admin-api/src/lib/repositories/tier-config.ts
import type { Pool } from 'pg'
import { TierConfigSchema, type TierConfig } from '../tier-config-shape'

type Queryable = Pick<Pool, 'query'>

export async function getTierConfigRow(db: Queryable): Promise<TierConfig | null> {
  const result = await db.query<{ config: unknown }>(
    `SELECT config FROM tier_config WHERE id = 1`,
  )
  const raw = result.rows[0]?.config
  if (raw === undefined) return null
  return TierConfigSchema.parse(raw)
}

export async function upsertTierConfig(
  db: Queryable,
  config: TierConfig,
  userId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO tier_config (id, config, updated_by, updated_at)
     VALUES (1, $1::jsonb, $2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET config = EXCLUDED.config,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [JSON.stringify(config), userId],
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace admin-api test src/lib/repositories/__tests__/tier-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
yarn workspace admin-api typecheck || yarn typecheck
git add admin-api/src/lib/tier-config-shape.ts admin-api/src/lib/repositories/tier-config.ts admin-api/src/lib/repositories/__tests__/tier-config.test.ts
git commit -m "feat(admin-api): tier-config repository and shared shape mirror"
```

---

### Task 4: admin-api cached reader

**Files:**
- Create: `admin-api/src/lib/tier-config-cache.ts`
- Test: `admin-api/src/lib/__tests__/tier-config-cache.test.ts`

**Interfaces:**
- Consumes: `getTierConfigRow` (Task 3); `DEFAULT_TIER_CONFIG` from `tier-config-shape`.
- Produces:
  - `function getCachedTierConfig(db: Queryable, now?: number): Promise<TierConfig>` — returns DB row or `DEFAULT_TIER_CONFIG`, memoised ~60s.
  - `function bustTierConfigCache(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// admin-api/src/lib/__tests__/tier-config-cache.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getCachedTierConfig, bustTierConfigCache } from '../tier-config-cache'
import { DEFAULT_TIER_CONFIG } from '../tier-config-shape'

const row = structuredClone(DEFAULT_TIER_CONFIG)
row.tiers[1].priceMonthly = 25

function dbReturning(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) }
}

describe('tier-config cache', () => {
  beforeEach(() => bustTierConfigCache())

  it('falls back to DEFAULT when no row', async () => {
    const db = dbReturning([])
    expect(await getCachedTierConfig(db, 1000)).toEqual(DEFAULT_TIER_CONFIG)
  })

  it('memoises within the TTL (one DB hit)', async () => {
    const db = dbReturning([{ config: row }])
    await getCachedTierConfig(db, 1000)
    await getCachedTierConfig(db, 1000 + 30_000)
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  it('refetches after TTL', async () => {
    const db = dbReturning([{ config: row }])
    await getCachedTierConfig(db, 1000)
    await getCachedTierConfig(db, 1000 + 61_000)
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('bust forces a refetch', async () => {
    const db = dbReturning([{ config: row }])
    await getCachedTierConfig(db, 1000)
    bustTierConfigCache()
    await getCachedTierConfig(db, 1000)
    expect(db.query).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test src/lib/__tests__/tier-config-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// admin-api/src/lib/tier-config-cache.ts
import type { Pool } from 'pg'
import { getTierConfigRow } from './repositories/tier-config'
import { DEFAULT_TIER_CONFIG, type TierConfig } from './tier-config-shape'

type Queryable = Pick<Pool, 'query'>
const TTL_MS = 60_000

let cached: TierConfig | null = null
let fetchedAt = 0

export function bustTierConfigCache(): void {
  cached = null
  fetchedAt = 0
}

export async function getCachedTierConfig(db: Queryable, now = Date.now()): Promise<TierConfig> {
  if (cached && now - fetchedAt < TTL_MS) return cached
  const row = await getTierConfigRow(db)
  cached = row ?? DEFAULT_TIER_CONFIG
  fetchedAt = now
  return cached
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test src/lib/__tests__/tier-config-cache.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/tier-config-cache.ts admin-api/src/lib/__tests__/tier-config-cache.test.ts
git commit -m "feat(admin-api): cached tier-config reader with TTL and bust"
```

---

### Task 5: entitlements read from config

**Files:**
- Modify: `admin-api/src/lib/entitlements.ts`
- Test: `admin-api/src/lib/__tests__/entitlements.test.ts`

**Interfaces:**
- Consumes: `getCachedTierConfig` (Task 4); `nullToInfinity` from `tier-config-shape`; existing `EffectivePlan`, `isFullAccess`.
- Produces: `function entitlementsFromConfig(config: TierConfig, plan: EffectivePlan, role?: string | null): Entitlements` — pure mapper used by callers that already hold the cached config; keeps existing static `entitlementsFor` as fallback.

Note: keep the existing synchronous `entitlementsFor(plan, role)` (static map) intact for any caller that cannot await. Add the new config-aware function alongside; migrate hot-path callers (quota checks in `users.ts`) only if they already have a `db` in scope — otherwise leave them on the static path (admin override still applies). This keeps the change additive and low-risk.

- [ ] **Step 1: Write the failing test**

```ts
// admin-api/src/lib/__tests__/entitlements.test.ts
import { describe, expect, it } from 'vitest'
import { entitlementsFromConfig } from '../entitlements'
import { DEFAULT_TIER_CONFIG } from '../tier-config-shape'

describe('entitlementsFromConfig', () => {
  it('maps free tier limits from config', () => {
    const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'free')
    expect(e.repos).toBe(1)
    expect(e.resumesPerMonth).toBe(1)
    expect(e.enrichment).toBe('tier1')
  })

  it('maps null entitlements to Infinity', () => {
    const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'pro')
    expect(e.repos).toBe(Number.POSITIVE_INFINITY)
  })

  it('admin role gets premium entitlements regardless of plan', () => {
    const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'free', 'admin')
    expect(e.repos).toBe(Number.POSITIVE_INFINITY)
    expect(e.enrichment).toBe('full')
  })

  it('falls back to free limits when plan absent in config (trial)', () => {
    const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'trial')
    // trial is not a stored tier id; treated as unlimited per existing map
    expect(e.repos).toBe(Number.POSITIVE_INFINITY)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test src/lib/__tests__/entitlements.test.ts`
Expected: FAIL — `entitlementsFromConfig` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `admin-api/src/lib/entitlements.ts`)

```ts
import { nullToInfinity, type TierConfig, type PlanId } from './tier-config-shape'

const STORED_IDS = new Set<string>(['free', 'pro', 'premium'])

/**
 * Entitlements derived from the live tier config. `trial` has no stored row,
 * so it keeps the static UNLIMITED treatment. Admin role still overrides to
 * the premium row.
 */
export function entitlementsFromConfig(
  config: TierConfig,
  plan: EffectivePlan,
  role?: string | null,
): Entitlements {
  const targetId: PlanId = isFullAccess(role) ? 'premium' : pickStoredId(plan)
  const entry = config.tiers.find((t) => t.id === targetId)
  if (!entry) return ENTITLEMENTS[plan]
  const e = entry.entitlements
  return {
    repos: nullToInfinity(e.repos),
    projects: nullToInfinity(e.projects),
    resumesPerMonth: nullToInfinity(e.resumesPerMonth),
    ingestionJobsPerMonth: nullToInfinity(e.ingestionJobsPerMonth),
    enrichment: e.enrichment,
  }
}

function pickStoredId(plan: EffectivePlan): PlanId {
  if (STORED_IDS.has(plan)) return plan as PlanId
  return 'premium' // trial → unlimited, matches static map
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test src/lib/__tests__/entitlements.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
yarn workspace admin-api typecheck || yarn typecheck
git add admin-api/src/lib/entitlements.ts admin-api/src/lib/__tests__/entitlements.test.ts
git commit -m "feat(admin-api): derive entitlements from live tier config"
```

---

### Task 6: admin-api tier-config router + mount

**Files:**
- Create: `admin-api/src/routes/tier-config.ts`
- Modify: `admin-api/src/index.ts`
- Test: `admin-api/src/routes/__tests__/tier-config.test.ts`

**Interfaces:**
- Consumes: `getCachedTierConfig`, `bustTierConfigCache` (Task 4); `getTierConfigRow`, `upsertTierConfig` (Task 3); `TierConfigSchema` (`tier-config-shape`); existing `getPool(config)`, `requireAdminGroup()`, `AdminApiBindings`, `AdminApiConfig` (match `articles.ts`); the authed user id from context (same accessor `articles.ts`/`me.ts` use — confirm in code, e.g. `ctx.get('userId')`).
- Produces: `function createTierConfigRouter(config: AdminApiConfig): Hono<AdminApiBindings>` mounted at `/tier-config`.

- [ ] **Step 1: Write the failing test** (handler-level, mirror existing route tests in `admin-api/src/routes/__tests__`)

```ts
// admin-api/src/routes/__tests__/tier-config.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { createTierConfigRouter } from '../tier-config'
import { DEFAULT_TIER_CONFIG } from '../../lib/tier-config-shape'

vi.mock('../../lib/pg', () => ({
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}))
// requireAdminGroup is bypassed in unit context by stubbing the middleware
// module the same way existing route tests do; if the repo's tests hit a real
// app, follow that harness instead.

describe('tier-config router', () => {
  it('GET returns the default config when no row', async () => {
    const app = new Hono()
    app.route('/tier-config', createTierConfigRouter({} as never))
    const res = await app.request('/tier-config')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiers.map((t: { id: string }) => t.id)).toEqual(['free', 'pro', 'premium'])
  })

  it('PUT rejects an invalid config with 400', async () => {
    const app = new Hono()
    app.route('/tier-config', createTierConfigRouter({} as never))
    const bad = structuredClone(DEFAULT_TIER_CONFIG)
    bad.tiers[1].priceMonthly = -5
    const res = await app.request('/tier-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bad),
    })
    expect(res.status).toBe(400)
  })
})
```

(If the existing route tests use a different harness/mock for `requireAdminGroup` and `getPool`, follow that exact pattern — read one sibling test in `admin-api/src/routes/__tests__/` first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test src/routes/__tests__/tier-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// admin-api/src/routes/tier-config.ts
import { Hono } from 'hono'
import type { AdminApiBindings, AdminApiConfig } from '../types' // match articles.ts import
import { getPool } from '../lib/pg'
import { requireAdminGroup } from '../middleware/auth'
import { TierConfigSchema } from '../lib/tier-config-shape'
import { getTierConfigRow, upsertTierConfig } from '../lib/repositories/tier-config'
import { getCachedTierConfig, bustTierConfigCache } from '../lib/tier-config-cache'

export function createTierConfigRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>()

  // Read: any authed user (feeds public catalog + checkout). No admin gate.
  router.get('/', async (ctx) => {
    const pool = getPool(config)
    const cfg = await getCachedTierConfig(pool)
    return ctx.json(cfg)
  })

  // Write: admin only.
  router.put('/', requireAdminGroup(), async (ctx) => {
    const body = await ctx.req.json<unknown>()
    const parsed = TierConfigSchema.safeParse(body)
    if (!parsed.success) {
      return ctx.json({ error: 'Invalid tier config', issues: parsed.error.issues }, 400)
    }
    const userId = ctx.get('userId') // same accessor as me.ts/articles.ts
    const pool = getPool(config)
    await upsertTierConfig(pool, parsed.data, userId)
    bustTierConfigCache()
    return ctx.json({ updated: true })
  })

  return router
}
```

- [ ] **Step 4: Mount in `admin-api/src/index.ts`**

Find where sibling admin routers mount (e.g. `app.route('/api/admin/articles', createArticlesRouter(config))`) and add:

```ts
import { createTierConfigRouter } from './routes/tier-config'
// ...
app.route('/api/admin/tier-config', createTierConfigRouter(config))
```

- [ ] **Step 5: Run test + typecheck**

Run: `yarn workspace admin-api test src/routes/__tests__/tier-config.test.ts`
Expected: PASS.
Run: `yarn workspace admin-api typecheck || yarn typecheck`

- [ ] **Step 6: Commit**

```bash
git add admin-api/src/routes/tier-config.ts admin-api/src/routes/__tests__/tier-config.test.ts admin-api/src/index.ts
git commit -m "feat(admin-api): GET/PUT tier-config routes (admin-gated write)"
```

---

### Task 7: tucaken-app server fns + Stripe config-aware lookup

**Files:**
- Create: `src/server/tier-config.ts`
- Modify: `src/server/stripe.ts`
- Test: `src/server/__tests__/stripe-tier-lookup.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (`src/server/_api-client.ts`); `requireAuth` (find in `src/server/` — used by `getMeFn`); `createServerFn` (`@tanstack/react-start`); `TierConfig`, `TierConfigSchema` (`src/features/billing/tier-config.ts`); `stripe()` client + `required` env helper (`src/server/stripe.ts`); `PlanId`.
- Produces:
  - `getTierConfigFn: () => Promise<TierConfig>`
  - `updateTierConfigFn: (data: TierConfig) => Promise<{ updated: true }>`
  - `listStripePricesFn: () => Promise<Array<{ id: string; nickname: string | null; unitAmount: number | null; currency: string; productName: string | null }>>`
  - In `stripe.ts`: `priceIdForTierFromConfig(config: TierConfig | null, tier: PlanId): string` and `tierForPriceIdFromConfig(config: TierConfig | null, priceId: string): PlanId | null` (env fallback preserved).

- [ ] **Step 1: Write the failing test** (pure lookups — no network)

```ts
// src/server/__tests__/stripe-tier-lookup.test.ts
import { describe, expect, it } from 'vitest'
import { priceIdForTierFromConfig, tierForPriceIdFromConfig } from '../stripe'
import { DEFAULT_TIER_CONFIG } from '@/features/billing/tier-config'

const cfg = structuredClone(DEFAULT_TIER_CONFIG)
cfg.tiers[1].stripePriceIdMonthly = 'price_pro_live'
cfg.tiers[2].stripePriceIdMonthly = 'price_premium_live'

describe('config-aware Stripe lookup', () => {
  it('resolves a paid tier price id from config', () => {
    expect(priceIdForTierFromConfig(cfg, 'pro')).toBe('price_pro_live')
  })

  it('throws for the free tier', () => {
    expect(() => priceIdForTierFromConfig(cfg, 'free')).toThrow()
  })

  it('inverts a price id back to its tier', () => {
    expect(tierForPriceIdFromConfig(cfg, 'price_premium_live')).toBe('premium')
    expect(tierForPriceIdFromConfig(cfg, 'price_unknown')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/server/__tests__/stripe-tier-lookup.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the lookups in `src/server/stripe.ts`** (add; keep existing env `priceIdForTier`/`tierForPriceId` as fallback)

```ts
import type { TierConfig } from '@/features/billing/tier-config'

export function priceIdForTierFromConfig(config: TierConfig | null, tier: PlanId): string {
  if (tier === 'free') throw new Error('Free tier has no Stripe price — do not call checkout.')
  const entry = config?.tiers.find((t) => t.id === tier)
  if (entry?.stripePriceIdMonthly) return entry.stripePriceIdMonthly
  return priceIdForTier(tier) // env fallback
}

export function tierForPriceIdFromConfig(config: TierConfig | null, priceId: string): PlanId | null {
  const entry = config?.tiers.find((t) => t.stripePriceIdMonthly === priceId)
  if (entry) return entry.id
  return tierForPriceId(priceId) // env fallback
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/server/__tests__/stripe-tier-lookup.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the server fns** `src/server/tier-config.ts`

```ts
// src/server/tier-config.ts
import { createServerFn } from '@tanstack/react-start'
import { apiFetch } from './_api-client'
import { requireAuth } from './me' // wherever requireAuth is exported
import { stripe } from './stripe'
import { TierConfigSchema, type TierConfig } from '@/features/billing/tier-config'

export const getTierConfigFn = createServerFn({ method: 'GET' }).handler(async (): Promise<TierConfig> => {
  await requireAuth()
  return apiFetch<TierConfig>('/tier-config')
})

export const updateTierConfigFn = createServerFn({ method: 'POST' })
  .inputValidator(TierConfigSchema)
  .handler(async ({ data }): Promise<{ updated: true }> => {
    await requireAuth()
    return apiFetch<{ updated: true }>('/tier-config', {
      method: 'PUT',
      pathTemplate: '/tier-config',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    })
  })

export const listStripePricesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  const res = await stripe().prices.list({ active: true, expand: ['data.product'], limit: 100 })
  return res.data.map((p) => ({
    id: p.id,
    nickname: p.nickname ?? null,
    unitAmount: p.unit_amount ?? null,
    currency: p.currency,
    productName: typeof p.product === 'object' && p.product && 'name' in p.product ? (p.product as { name: string }).name : null,
  }))
})
```

(Confirm `requireAuth`'s real export path before writing — it's used by `getMeFn` in `src/server/me.ts`.)

- [ ] **Step 6: Typecheck + commit**

```bash
yarn typecheck
git add src/server/tier-config.ts src/server/stripe.ts src/server/__tests__/stripe-tier-lookup.test.ts
git commit -m "feat(billing): config-aware Stripe lookup and tier-config server fns"
```

---

### Task 8: Admin TierConfigSection UI + wire into Settings

**Files:**
- Create: `src/features/account/settings/TierConfigSection.tsx`
- Modify: `src/features/account/settings/SettingsPage.tsx`
- Test: `src/features/account/settings/__tests__/TierConfigSection.test.tsx`

**Interfaces:**
- Consumes: `getTierConfigFn`, `updateTierConfigFn`, `listStripePricesFn` (Task 7); `Card`/`Field`/`Row`/`Toggle`/`inputCls` (`src/features/account/components/primitives.tsx`); TanStack Query `useQuery`/`useMutation`/`useQueryClient`; `adminKeys` (`src/lib/api/query-keys`); `TierConfig`, `infinityToNull`/`nullToInfinity` (`src/features/billing/tier-config.ts`).
- Produces: `function TierConfigSection(): JSX.Element`.

Keep each render helper ≤ 10 complexity: extract `TierCard({ entry, onChange, prices })`, `EntitlementField`, `PriceSelect`. Use guard returns for loading/error. Keys from `tier.id` + field name. Confirm dialog before mutate.

- [ ] **Step 1: Write the failing test** (render + admin-gate behaviour via a thin smoke test)

```tsx
// src/features/account/settings/__tests__/TierConfigSection.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TierConfigSection } from '../TierConfigSection'
import { DEFAULT_TIER_CONFIG } from '@/features/billing/tier-config'

vi.mock('@/server/tier-config', () => ({
  getTierConfigFn: vi.fn().mockResolvedValue(DEFAULT_TIER_CONFIG),
  updateTierConfigFn: vi.fn().mockResolvedValue({ updated: true }),
  listStripePricesFn: vi.fn().mockResolvedValue([]),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('TierConfigSection', () => {
  it('renders the three tier names once loaded', async () => {
    wrap(<TierConfigSection />)
    await waitFor(() => expect(screen.getByDisplayValue('Pro')).toBeInTheDocument())
    expect(screen.getByDisplayValue('Free')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Premium')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/features/account/settings/__tests__/TierConfigSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TierConfigSection.tsx`**

Build with the existing primitives. Skeleton (fill all three tiers, the entitlement inputs with Unlimited toggles, Stripe `<select>` from `listStripePricesFn` with a text fallback, and a confirm dialog gating `mutate`):

```tsx
// src/features/account/settings/TierConfigSection.tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Field, inputCls } from '../components/primitives'
import { Toggle } from '../components/primitives'
import { getTierConfigFn, listStripePricesFn, updateTierConfigFn } from '@/server/tier-config'
import { adminKeys } from '@/lib/api/query-keys'
import type { TierConfig, TierConfigEntry } from '@/features/billing/tier-config'

export function TierConfigSection() {
  const qc = useQueryClient()
  const cfgQuery = useQuery({ queryKey: ['tier-config'], queryFn: getTierConfigFn })
  const pricesQuery = useQuery({ queryKey: ['stripe-prices'], queryFn: listStripePricesFn })
  const [draft, setDraft] = useState<TierConfig | null>(null)
  const [confirming, setConfirming] = useState(false)

  const save = useMutation({
    mutationFn: (cfg: TierConfig) => updateTierConfigFn({ data: cfg }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tier-config'] })
      qc.invalidateQueries({ queryKey: adminKeys.me.detail() })
      setConfirming(false)
    },
  })

  if (cfgQuery.isLoading) return <Card><p className="text-sm">Loading tiers…</p></Card>
  if (cfgQuery.isError || !cfgQuery.data) return <Card><p className="text-sm text-red-600">Could not load tier config.</p></Card>

  const config = draft ?? cfgQuery.data

  function patchTier(id: string, patch: Partial<TierConfigEntry>) {
    setDraft({ tiers: config.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  }

  return (
    <div className="space-y-4">
      {config.tiers.map((entry) => (
        <TierCard
          key={entry.id}
          entry={entry}
          prices={pricesQuery.data ?? []}
          onChange={(patch) => patchTier(entry.id, patch)}
        />
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!draft || save.isPending}
          onClick={() => setConfirming(true)}
        >
          Save tiers
        </button>
        {save.isError ? <span className="text-sm text-red-600">Save failed.</span> : null}
      </div>

      {confirming ? (
        <ConfirmDialog
          pending={save.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => save.mutate(config)}
        />
      ) : null}
    </div>
  )
}
```

Add these helpers in the same file (each ≤ 10 complexity):

```tsx
function TierCard({ entry, prices, onChange }: {
  entry: TierConfigEntry
  prices: Array<{ id: string; nickname: string | null; productName: string | null }>
  onChange: (patch: Partial<TierConfigEntry>) => void
}) {
  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Name">
          <input className={inputCls()} value={entry.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="CTA label">
          <input className={inputCls()} value={entry.cta} onChange={(e) => onChange({ cta: e.target.value })} />
        </Field>
        <Field label="Monthly price (USD)">
          <input
            className={inputCls()}
            type="number"
            min={0}
            value={entry.priceMonthly}
            onChange={(e) => onChange({ priceMonthly: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </Field>
        <Field label="Annual price (USD)">
          <input
            className={inputCls()}
            type="number"
            min={0}
            value={entry.priceAnnual}
            onChange={(e) => onChange({ priceAnnual: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </Field>
      </div>

      {entry.free ? null : (
        <Field label="Stripe price (monthly)">
          <PriceSelect value={entry.stripePriceIdMonthly} prices={prices} onChange={(v) => onChange({ stripePriceIdMonthly: v })} />
        </Field>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <EntitlementField label="Repositories" value={entry.entitlements.repos} onChange={(v) => onChange({ entitlements: { ...entry.entitlements, repos: v } })} />
        <EntitlementField label="Projects" value={entry.entitlements.projects} onChange={(v) => onChange({ entitlements: { ...entry.entitlements, projects: v } })} />
        <EntitlementField label="Resumes / month" value={entry.entitlements.resumesPerMonth} onChange={(v) => onChange({ entitlements: { ...entry.entitlements, resumesPerMonth: v } })} />
        <EntitlementField label="Ingestion jobs / month" value={entry.entitlements.ingestionJobsPerMonth} onChange={(v) => onChange({ entitlements: { ...entry.entitlements, ingestionJobsPerMonth: v } })} />
        <Field label="Enrichment depth">
          <select className={inputCls()} value={entry.entitlements.enrichment} onChange={(e) => onChange({ entitlements: { ...entry.entitlements, enrichment: e.target.value === 'full' ? 'full' : 'tier1' } })}>
            <option value="tier1">Tier 1</option>
            <option value="full">Full</option>
          </select>
        </Field>
      </div>
    </Card>
  )
}

function EntitlementField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const unlimited = value === null
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          className={inputCls()}
          type="number"
          min={0}
          disabled={unlimited}
          value={unlimited ? '' : value}
          onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
        />
        <label className="flex items-center gap-1 text-xs">
          <Toggle checked={unlimited} onChange={(on) => onChange(on ? null : 0)} />
          Unlimited
        </label>
      </div>
    </Field>
  )
}

function PriceSelect({ value, prices, onChange }: { value: string | null; prices: Array<{ id: string; nickname: string | null; productName: string | null }>; onChange: (v: string) => void }) {
  if (prices.length === 0) {
    return <input className={inputCls()} value={value ?? ''} placeholder="price_..." onChange={(e) => onChange(e.target.value)} />
  }
  return (
    <select className={inputCls()} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>Select a Stripe price…</option>
      {prices.map((p) => (
        <option key={p.id} value={p.id}>{p.productName ?? p.nickname ?? p.id}</option>
      ))}
    </select>
  )
}

function ConfirmDialog({ pending, onCancel, onConfirm }: { pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
      <p className="text-sm">Entitlement changes affect live user quotas immediately. Save these tier settings?</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-md bg-teal-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={pending} onClick={onConfirm}>Confirm save</button>
        <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
```

(Match `Toggle`'s real prop names from `primitives.tsx` — adjust `checked`/`onChange` if the component uses different names. Match `inputCls()` signature.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/features/account/settings/__tests__/TierConfigSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into `SettingsPage.tsx` (admin-only)**

- Add `CreditCard` to the `lucide-react` import.
- Read admin flag: `SettingsPage` already queries `me`; derive `const isAdmin = me?.plan?.role === 'admin'`.
- Build `SECTIONS` conditionally so the table-of-contents matches what renders:

```tsx
const BASE_SECTIONS: PageNavSection[] = [ /* existing entries */ ]
const sections = isAdmin
  ? [...BASE_SECTIONS, { id: 'tiers', label: 'Subscription tiers', icon: CreditCard }]
  : BASE_SECTIONS
```

- Pass `sections={sections}` to `PageShell`.
- Render the section last, gated:

```tsx
{isAdmin ? (
  <PageSection id="tiers" label="Subscription tiers" sub="Control Free, Pro and Premium pricing, Stripe mapping and entitlements. Owner only.">
    <TierConfigSection />
  </PageSection>
) : null}
```

- [ ] **Step 6: Typecheck, lint, full test, commit**

```bash
yarn typecheck && yarn lint && yarn test
git add src/features/account/settings/TierConfigSection.tsx src/features/account/settings/SettingsPage.tsx src/features/account/settings/__tests__/TierConfigSection.test.tsx
git commit -m "feat(settings): admin-only subscription tier configuration section"
```

---

### Task 9: RDS migration (separate repo / separate PR)

**Files:**
- Create: `ai-applications/applications/platform-rds-bootstrap/migrations/104_tier_config.sql`

**Interfaces:**
- Consumes: existing `users` table (for the `updated_by` FK).
- Produces: `tier_config` table read by Task 3's repository.

Do this in the platform-rds-bootstrap repo, not this worktree — its own branch + PR. Confirm the next free number is `104` (Task context says latest is `103`); bump if a newer migration exists.

- [ ] **Step 1: Write the migration**

```sql
-- 104_tier_config.sql
-- Single-row editable subscription tier configuration (display copy, Stripe
-- price mapping, per-tier entitlements). Read by admin-api; admin-gated write.
CREATE TABLE IF NOT EXISTS tier_config (
  id          SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config      JSONB        NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID         REFERENCES users(id)
);
```

- [ ] **Step 2: Validate locally** (per that repo's runner — do NOT edit an already-applied migration; the checksum ledger rejects edits)

Run the bootstrap migration runner against a dev DB and confirm `schema_migrations` records `104_tier_config.sql`.

- [ ] **Step 3: Commit in the platform-rds-bootstrap repo**

```bash
git add migrations/104_tier_config.sql
git commit -m "feat(migrations): add tier_config single-row table"
```

---

### Task 10: Wire reads into checkout + webhook (config-aware), final verification

**Files:**
- Modify: checkout server logic (`src/server/billing.ts:231` area — where `priceIdForTier(data.tier)` is called) to fetch config and use `priceIdForTierFromConfig`.
- Modify: the Stripe webhook handler that calls `tierForPriceId` to use `tierForPriceIdFromConfig` with fetched config.

**Interfaces:**
- Consumes: `getTierConfigFn`/`apiFetch('/tier-config')`, `priceIdForTierFromConfig`, `tierForPriceIdFromConfig` (Task 7).

- [ ] **Step 1: Update checkout**

In `src/server/billing.ts` where `const priceId = priceIdForTier(data.tier)` is, fetch config first and swap:

```ts
const config = await apiFetch<import('@/features/billing/tier-config').TierConfig>('/tier-config').catch(() => null)
const priceId = priceIdForTierFromConfig(config, data.tier)
```

- [ ] **Step 2: Update webhook inverse lookup**

Find the webhook handler calling `tierForPriceId(priceId)`; fetch config (same `apiFetch('/tier-config').catch(() => null)`) and call `tierForPriceIdFromConfig(config, priceId)`. Env fallback inside the function keeps pre-migration behaviour.

- [ ] **Step 3: Full verification**

```bash
yarn typecheck && yarn lint && yarn test
yarn workspace admin-api test
```

Expected: all green.

- [ ] **Step 4: Manual smoke (UI)**

```bash
yarn dev
```

Sign in as an admin user, open Settings → "Subscription tiers", change Pro's monthly price + an entitlement, Save → confirm dialog → save. Confirm the `me`/catalog queries refetch. As a non-admin, confirm the section does not render.

- [ ] **Step 5: Commit**

```bash
git add src/server/billing.ts src/server/*webhook*
git commit -m "feat(billing): checkout and webhook read tier config for Stripe mapping"
```

---

## Self-review notes

- **Spec coverage:** data model (T1/T9), admin-api read+write+cache (T3/T4/T6), entitlements from config (T5), Stripe map + server fns (T7/T10), frontend admin section + confirm dialog (T8), validation/zod (T1/T6), tests (every task). All spec sections mapped.
- **Cross-package note:** admin-api cannot import app `src/` — handled by the `tier-config-shape.ts` mirror (T3 step 1). Keep the two in sync; both have schema tests.
- **Type consistency:** `TierConfig`/`TierConfigEntry`/`TierEntitlements` names identical across app + admin-api mirror. `priceIdForTierFromConfig`/`tierForPriceIdFromConfig` used consistently in T7 + T10.
- **Risk/rollout:** env fallbacks in T7 + seed default in T1/T4 keep checkout and entitlements working before migration T9 lands, so app PR can merge first.
- **Verify-before-write reminders embedded:** confirm `requireAuth` export path, `ctx.get('userId')` accessor, `Toggle`/`inputCls` prop names, and sibling route test harness against the real code before implementing those steps.
