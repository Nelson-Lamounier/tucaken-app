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
