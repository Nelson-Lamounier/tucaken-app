/**
 * @format
 * Regression: charges are CENTS and must render as 2-dp dollars (÷100).
 * Guards against the cents-shown-as-dollars mistake (5183.31¢ → "$51.83").
 */
import { describe, expect, it } from 'vitest'
import { formatCents, formatDateTime } from '@/features/reports/cost-format'

describe('formatCents', () => {
  it('converts cents to a 2-decimal dollar string', () => {
    expect(formatCents(5183.31)).toBe('$51.83') // 5183.31¢ = $51.83, NOT $5183.31
    expect(formatCents(574.16)).toBe('$5.74')
    expect(formatCents(34.34)).toBe('$0.34')
  })

  it('rounds to exactly two decimals (no sub-cent tail)', () => {
    expect(formatCents(2340.96)).toBe('$23.41') // was $23.4096 before rounding fix
    expect(formatCents(0)).toBe('$0.00')
  })
})

describe('formatDateTime', () => {
  it('returns an em dash for a null timestamp', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('formats an ISO timestamp', () => {
    expect(formatDateTime('2026-06-15T10:00:00.000Z')).toMatch(/2026/)
  })
})
