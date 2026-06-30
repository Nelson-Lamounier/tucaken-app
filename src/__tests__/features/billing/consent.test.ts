import { describe, it, expect } from 'vitest'
import {
  checkoutConsentSchema,
  buildConsentMetadata,
} from '@/features/billing/consent'
import { LEGAL } from '@/features/legal/config'

describe('checkout consent', () => {
  it('accepts only an affirmative true', () => {
    expect(checkoutConsentSchema.safeParse({ termsAccepted: true }).success).toBe(true)
    expect(checkoutConsentSchema.safeParse({ termsAccepted: false }).success).toBe(false)
    expect(checkoutConsentSchema.safeParse({}).success).toBe(false)
  })

  it('builds server-authoritative consent metadata', () => {
    const md = buildConsentMetadata(new Date('2020-01-02T03:04:05.000Z'))
    expect(md).toEqual({
      terms_accepted: 'true',
      terms_version: LEGAL.lastUpdated,
      terms_accepted_at: '2020-01-02T03:04:05.000Z',
    })
  })
})
