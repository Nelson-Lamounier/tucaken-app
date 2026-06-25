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
    const idSet = new Set(ids)
    if (ids.length !== TIER_IDS.length || idSet.size !== TIER_IDS.length || !ids.every((id) => wanted.has(id))) {
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
