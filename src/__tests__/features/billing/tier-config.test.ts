import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIER_CONFIG,
  TierConfigSchema,
  nullToInfinity,
  infinityToNull,
} from '@/features/billing/tier-config'

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
