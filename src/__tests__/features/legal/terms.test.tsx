/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { termsDoc } from '@/features/legal/content/terms'

describe('termsDoc', () => {
  it('is the terms document with the required clauses', () => {
    expect(termsDoc.slug).toBe('terms')
    const ids = new Set(termsDoc.sections.map((s) => s.id))
    for (const id of ['who-we-are', 'eligibility', 'acceptable-use', 'ai-output', 'ip', 'third-parties', 'billing', 'liability', 'governing-law']) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('has unique section ids', () => {
    const ids = termsDoc.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('billing section states subscriptions are non-refundable', () => {
    const billingSection = termsDoc.sections.find((s) => s.id === 'billing')
    expect(billingSection).toBeDefined()

    // Render the body to text
    const bodyText = String((billingSection?.body as any)?.props?.children || '')

    // Check for key phrase
    expect(bodyText).toContain('Subscriptions are non-refundable')
  })
})
