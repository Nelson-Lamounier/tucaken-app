/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { cookiesDoc } from '@/features/legal/content/cookies'

describe('cookiesDoc', () => {
  it('is the cookies document with the required sections', () => {
    expect(cookiesDoc.slug).toBe('cookies')
    const ids = new Set(cookiesDoc.sections.map((s) => s.id))
    for (const id of ['what-we-use', 'manage']) {
      expect(ids.has(id)).toBe(true)
    }
  })
})
