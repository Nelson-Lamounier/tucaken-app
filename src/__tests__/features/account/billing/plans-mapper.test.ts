import { describe, expect, it } from 'vitest'
import { plansFromTiers, PLANS } from '@/features/account/billing/plans'
import { TIERS } from '@/features/billing/catalog'

describe('plansFromTiers', () => {
  it('reshapes Tier[] into PlanDefinition[] (price/yearly/popular)', () => {
    const out = plansFromTiers(TIERS)
    expect(out.map((p) => p.id)).toEqual(TIERS.map((t) => t.id))
    expect(out[1].price).toBe(TIERS[1].priceMonthly)
    expect(out[1].yearly).toBe(TIERS[1].priceAnnual)
    expect(out[1].popular).toBe(TIERS[1].highlighted)
  })

  it('matches the static PLANS catalog when fed TIERS', () => {
    expect(plansFromTiers(TIERS)).toEqual(PLANS)
  })
})
