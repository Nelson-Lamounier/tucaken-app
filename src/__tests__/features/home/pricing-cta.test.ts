import { describe, it, expect } from 'vitest'
import { tierCtaTarget } from '@/features/home/lib/pricing-cta'
import { TIERS } from '@/features/billing/catalog'

const byId = (id: string) => {
  const t = TIERS.find((x) => x.id === id)
  if (!t) throw new Error(`missing tier ${id}`)
  return t
}

describe('tierCtaTarget', () => {
  it('routes the free tier to sign-in', () => {
    expect(tierCtaTarget(byId('free'))).toEqual({ to: '/sign-in' })
  })

  it('routes a paid tier to checkout with its id', () => {
    expect(tierCtaTarget(byId('pro'))).toEqual({
      to: '/checkout/$tier',
      params: { tier: 'pro' },
    })
  })
})
