// src/features/billing/catalog.ts
//
// Single source of truth for subscription tiers across the app:
//   - Home PricingSection ("Free until it's worth paying for.")
//   - Public /pricing route
//   - Dashboard /_dashboard/billing PlanSection
//   - Server-side createCheckoutSession (looks up Stripe price by tier)
//
// Stripe price IDs are read from env at runtime (server-only). The tier
// catalog itself (display copy, features, dollar prices) is safe to ship
// to the client.

import type { PlanId } from '@/features/account/types'
import type { TierConfig } from '@/features/billing/tier-config'

export type BillingInterval = 'monthly' | 'annual'

export interface Tier {
  id: PlanId
  name: string
  /** Display price in USD per month. 0 = Free. */
  priceMonthly: number
  /** Display price in USD per year (usually ~10x monthly with discount). */
  priceAnnual: number
  /** Marketing one-liner. */
  blurb: string
  /** Feature bullets shown on pricing cards. */
  features: string[]
  /** CTA label on home / pricing pages. */
  cta: string
  /** Visually emphasised tier (Recommended badge). */
  highlighted?: boolean
  /** No Stripe checkout for $0 tier — CTA goes to /sign-in instead. */
  free?: boolean
}

export const TIERS: readonly Tier[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    blurb: 'Try the basics. Hand-tuned resumes, no card required.',
    features: [
      '1 repository',
      '1 project',
      '1 tailored resume / month',
      'Tier-1 enrichment on sync',
      'PDF & web exports',
    ],
    cta: 'Start free',
    free: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 19,
    priceAnnual: 190,
    blurb: 'For developers actively job-hunting.',
    features: [
      'Unlimited repositories',
      'Unlimited tailored resumes',
      'AI-rewritten bullets grounded in commits',
      'Tier-1 enrichment on sync',
      'Custom domain on web resumes',
      'Priority support',
    ],
    cta: 'Go Pro',
    highlighted: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    priceMonthly: 49,
    priceAnnual: 490,
    blurb: 'Career-services orgs and bootcamps.',
    features: [
      'Unlimited repositories and resumes',
      'Deep chunk-enrichment on repository sync',
      'AI-rewritten bullets grounded in commits',
      'Full AI chunk-enrichment on sync',
      'Custom domain on web resumes',
      'Priority support',
    ],
    cta: 'Get Premium',
  },
] as const

export function findTier(id: PlanId): Tier | undefined {
  return TIERS.find((t) => t.id === id)
}

export function tierRank(id: PlanId): number {
  return TIERS.findIndex((t) => t.id === id)
}

/** Format a USD price for display ("$19" / "Free"). */
export function formatPrice(t: Tier, interval: BillingInterval = 'monthly'): string {
  if (t.free) return 'Free'
  const n = interval === 'monthly' ? t.priceMonthly : t.priceAnnual
  return `$${n}`
}

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
