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
})
