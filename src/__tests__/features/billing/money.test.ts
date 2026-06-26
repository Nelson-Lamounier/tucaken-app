import { describe, expect, it } from 'vitest'
import { toMinorUnits, ALLOWED_PRICE_CURRENCIES } from '@/features/billing/money'

describe('toMinorUnits', () => {
  it('converts whole major units to minor units', () => {
    expect(toMinorUnits(35)).toBe(3500)
    expect(toMinorUnits(100)).toBe(10000)
    expect(toMinorUnits(0)).toBe(0)
  })

  it('rounds floating-point noise to the nearest minor unit', () => {
    expect(toMinorUnits(19.99)).toBe(1999)
    expect(toMinorUnits(19.999)).toBe(2000)
  })
})

describe('ALLOWED_PRICE_CURRENCIES', () => {
  it('offers only two-decimal currencies', () => {
    expect(ALLOWED_PRICE_CURRENCIES).toEqual(['eur', 'usd', 'gbp'])
  })
})
