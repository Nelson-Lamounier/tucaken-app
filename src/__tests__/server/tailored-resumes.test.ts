import { describe, it, expect } from 'vitest'
import type { TailoredResumeSummary } from '@/server/applications'
import type { CoverLetter } from '@/lib/types/applications.types'

describe('TailoredResumeSummary', () => {
  it('carries a coverLetter field (nullable)', () => {
    const cl: CoverLetter = {
      greeting: 'Dear Hiring Manager',
      paragraphs: ['Body.'],
      signoff: { name: 'Nelson', email: 'a@b.c', linkedin: '', github: '' },
    }
    const withCl: TailoredResumeSummary = {
      slug: 's', targetCompany: 'C', targetRole: 'R', updatedAt: '2026-01-01',
      data: {} as TailoredResumeSummary['data'], coverLetter: cl,
    }
    const withoutCl: TailoredResumeSummary = { ...withCl, coverLetter: null }
    expect(withCl.coverLetter?.greeting).toBe('Dear Hiring Manager')
    expect(withoutCl.coverLetter).toBeNull()
  })
})
