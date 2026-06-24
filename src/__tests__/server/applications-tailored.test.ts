import { describe, it, expect } from 'vitest'
import type { CoverLetter } from '@/lib/types/applications.types'
import { updateCoverLetterSchema } from '@/server/applications'

describe('updateCoverLetterSchema — body contract for PUT /cover-letter', () => {
  const validCoverLetter: CoverLetter = {
    greeting: 'Dear Hiring Manager,',
    paragraphs: ['One.', 'Two.'],
    signoff: { name: 'Nelson', email: 'n@x.com', linkedin: '', github: '' },
  }

  it('accepts a valid { slug, coverLetter } object', () => {
    const result = updateCoverLetterSchema.safeParse({
      slug: 'acme-software-engineer',
      coverLetter: validCoverLetter,
    })
    expect(result.success).toBe(true)
  })

  it('accepts coverLetter: null (clears the override)', () => {
    const result = updateCoverLetterSchema.safeParse({
      slug: 'acme-software-engineer',
      coverLetter: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a malformed coverLetter — paragraphs not an array', () => {
    const result = updateCoverLetterSchema.safeParse({
      slug: 'acme-software-engineer',
      coverLetter: {
        greeting: 'Hi,',
        paragraphs: 'not-an-array',
        signoff: { name: 'N', email: 'e@x.com', linkedin: '', github: '' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed coverLetter — missing signoff', () => {
    const result = updateCoverLetterSchema.safeParse({
      slug: 'acme-software-engineer',
      coverLetter: {
        greeting: 'Hi,',
        paragraphs: ['One.'],
      },
    })
    expect(result.success).toBe(false)
  })
})
