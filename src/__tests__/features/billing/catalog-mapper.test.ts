import { describe, expect, it } from 'vitest'
import { tiersFromConfig, tiersFromPublic, TIERS } from '@/features/billing/catalog'
import { DEFAULT_TIER_CONFIG, type PublicTierConfig } from '@/features/billing/tier-config'

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

describe('tiersFromPublic', () => {
  const publicConfig: PublicTierConfig = {
    tiers: [
      { id: 'free', name: 'Free', blurb: 'b', cta: 'Start', highlighted: false, free: true, priceMonthly: 0, priceAnnual: 0, features: ['a'] },
      { id: 'pro', name: 'Pro', blurb: 'b', cta: 'Go', highlighted: true, free: false, priceMonthly: 25, priceAnnual: 250, features: ['x', 'y'] },
      { id: 'premium', name: 'Premium', blurb: 'b', cta: 'Get', highlighted: false, free: false, priceMonthly: 49, priceAnnual: 490, features: ['z'] },
    ],
  }

  it('falls back to TIERS when config is null/undefined', () => {
    expect(tiersFromPublic(null)).toBe(TIERS)
    expect(tiersFromPublic(undefined)).toBe(TIERS)
  })

  it('maps the public projection into Tier display shape', () => {
    const out = tiersFromPublic(publicConfig)
    expect(out.map((t) => t.id)).toEqual(['free', 'pro', 'premium'])
    expect(out[1].priceMonthly).toBe(25)
    expect(out[1].highlighted).toBe(true)
    expect(out[0].free).toBe(true)
  })
})
