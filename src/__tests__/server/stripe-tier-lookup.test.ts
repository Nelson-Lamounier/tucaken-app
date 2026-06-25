import { describe, expect, it } from 'vitest'
import { priceIdForTierFromConfig, tierForPriceIdFromConfig } from '@/server/stripe'
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
  })

  it('returns null for an unknown price id when env fallback has no match', () => {
    expect(tierForPriceIdFromConfig(cfg, 'price_unknown')).toBeNull()
  })
})

// Regression: a seed/placeholder price id in the DB tier config must never be
// sent to Stripe. Config is the single source of truth (Settings → Subscription
// Tiers) — an unconfigured tier throws an actionable error rather than silently
// using an env price. The live error was `No such price: 'price_seed_placeholder'`
// on premium checkout.
describe('placeholder / unconfigured price ids throw an actionable error', () => {
  it.each(['price_seed_placeholder', 'n_placeholder'])(
    'rejects placeholder %s with a Subscription Tiers hint',
    (placeholder) => {
      const seeded = structuredClone(DEFAULT_TIER_CONFIG)
      seeded.tiers[2].stripePriceIdMonthly = placeholder
      expect(() => priceIdForTierFromConfig(seeded, 'premium')).toThrow(
        /Subscription Tiers/,
      )
    },
  )

  it('throws when a paid tier has no price configured at all', () => {
    const seeded = structuredClone(DEFAULT_TIER_CONFIG)
    seeded.tiers[2].stripePriceIdMonthly = null
    expect(() => priceIdForTierFromConfig(seeded, 'premium')).toThrow(
      /No Stripe price is configured for the premium tier/,
    )
  })

  it('does not invert a placeholder price id to a tier', () => {
    const seeded = structuredClone(DEFAULT_TIER_CONFIG)
    seeded.tiers[2].stripePriceIdMonthly = 'price_seed_placeholder'
    expect(tierForPriceIdFromConfig(seeded, 'price_seed_placeholder')).toBeNull()
  })
})
