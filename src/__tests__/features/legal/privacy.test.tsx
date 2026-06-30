/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { privacyDoc } from '@/features/legal/content/privacy'

describe('privacyDoc', () => {
  it('is the privacy document with the required GDPR sections', () => {
    expect(privacyDoc.slug).toBe('privacy')
    const ids = new Set(privacyDoc.sections.map((s) => s.id))
    for (const id of ['controller', 'data-we-process', 'lawful-basis', 'sub-processors', 'automated-processing', 'rights']) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('has unique section ids', () => {
    const ids = privacyDoc.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
