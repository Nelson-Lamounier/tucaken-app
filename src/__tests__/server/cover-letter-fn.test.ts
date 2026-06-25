import { describe, it, expect } from 'vitest'
import { coverLetterBodySchema } from '@/server/applications'

describe('coverLetterBodySchema', () => {
  it('accepts a well-formed cover letter', () => {
    const ok = coverLetterBodySchema.safeParse({
      slug: 'acme-dev',
      coverLetter: { greeting: 'Hi', paragraphs: ['p'], signoff: { name: 'N', email: '', linkedin: '', github: '' } },
    })
    expect(ok.success).toBe(true)
  })
  it('rejects a missing slug', () => {
    const bad = coverLetterBodySchema.safeParse({ coverLetter: { greeting: '', paragraphs: [], signoff: { name: '', email: '', linkedin: '', github: '' } } })
    expect(bad.success).toBe(false)
  })
})
