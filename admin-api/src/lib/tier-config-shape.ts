//
// Mirror of tucaken-app src/features/billing/tier-config.ts — admin-api has a
// separate tsconfig and cannot import from the app source tree. Keep in sync
// with the app version whenever the schema or defaults change.

import { z } from 'zod'

export type PlanId = 'free' | 'pro' | 'premium'

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
    const allPresent = ids.every((id) => wanted.has(id))
    if (ids.length !== TIER_IDS.length || idSet.size !== TIER_IDS.length || !allPresent) {
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

// Inline seed values — mirrors ENTITLEMENT_SEED from the app's tier-config.ts.
const ENTITLEMENT_SEED: Record<PlanId, TierEntitlements> = {
  free:    { repos: 1,    projects: 1,    resumesPerMonth: 1,    ingestionJobsPerMonth: 3,    enrichment: 'tier1' },
  pro:     { repos: null, projects: null, resumesPerMonth: null, ingestionJobsPerMonth: null, enrichment: 'tier1' },
  premium: { repos: null, projects: null, resumesPerMonth: null, ingestionJobsPerMonth: null, enrichment: 'full'  },
}

// Inline display data — mirrors TIERS from src/features/billing/catalog.ts.
export const DEFAULT_TIER_CONFIG: TierConfig = {
  tiers: [
    {
      id: 'free',
      name: 'Free',
      blurb: 'Try the basics. Hand-tuned resumes, no card required.',
      cta: 'Start free',
      highlighted: false,
      free: true,
      priceMonthly: 0,
      priceAnnual: 0,
      stripePriceIdMonthly: null,
      features: [
        '1 repository',
        '1 project',
        '1 tailored resume / month',
        'Tier-1 enrichment on sync',
        'PDF & web exports',
      ],
      entitlements: ENTITLEMENT_SEED.free,
    },
    {
      id: 'pro',
      name: 'Pro',
      blurb: 'For developers actively job-hunting.',
      cta: 'Go Pro',
      highlighted: true,
      free: false,
      priceMonthly: 19,
      priceAnnual: 190,
      stripePriceIdMonthly: 'price_seed_placeholder',
      features: [
        'Unlimited repositories',
        'Unlimited tailored resumes',
        'AI-rewritten bullets grounded in commits',
        'Tier-1 enrichment on sync',
        'Custom domain on web resumes',
        'Priority support',
      ],
      entitlements: ENTITLEMENT_SEED.pro,
    },
    {
      id: 'premium',
      name: 'Premium',
      blurb: 'Career-services orgs and bootcamps.',
      cta: 'Get Premium',
      highlighted: false,
      free: false,
      priceMonthly: 49,
      priceAnnual: 490,
      stripePriceIdMonthly: 'price_seed_placeholder',
      features: [
        'Unlimited repositories and resumes',
        'Deep chunk-enrichment on repository sync',
        'AI-rewritten bullets grounded in commits',
        'Full AI chunk-enrichment on sync',
        'Custom domain on web resumes',
        'Priority support',
      ],
      entitlements: ENTITLEMENT_SEED.premium,
    },
  ],
}

export function nullToInfinity(v: number | null): number {
  return v === null ? Number.POSITIVE_INFINITY : v
}

export function infinityToNull(v: number): number | null {
  return Number.isFinite(v) ? v : null
}

// -----------------------------------------------------------------------------
// Public, display-only projection
// -----------------------------------------------------------------------------
//
// Returned by the unauthenticated GET /api/public/tier-config. Carries only the
// marketing display fields — entitlement limits and Stripe price IDs are
// stripped so anonymous visitors never see internal configuration.

export interface PublicTierEntry {
  id: PlanId
  name: string
  blurb: string
  cta: string
  highlighted: boolean
  free: boolean
  priceMonthly: number
  priceAnnual: number
  features: string[]
}

export interface PublicTierConfig {
  tiers: PublicTierEntry[]
}

export function toPublicTierConfig(config: TierConfig): PublicTierConfig {
  return {
    tiers: config.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      blurb: t.blurb,
      cta: t.cta,
      highlighted: t.highlighted,
      free: t.free,
      priceMonthly: t.priceMonthly,
      priceAnnual: t.priceAnnual,
      features: [...t.features],
    })),
  }
}
