import { describe, expect, it } from 'vitest'
import { tiersFromConfig, TIERS } from '@/features/billing/catalog'
import { DEFAULT_TIER_CONFIG } from '@/features/billing/tier-config'

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
