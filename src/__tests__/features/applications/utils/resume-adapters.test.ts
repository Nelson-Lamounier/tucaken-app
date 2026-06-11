import { describe, it, expect } from 'vitest'
import { mapApplicationToBuilderState } from '@/features/applications/utils/resume-adapters'
import type { ResumeData as AppResumeData } from '@/lib/resumes/resume-data'
import type { CoverLetter } from '@/lib/types/applications.types'

const minimalResume = {
  profile: { name: 'Nelson Lamounier', title: 'Technical Operations Engineer' },
} as AppResumeData

function buildCover(coverLetter: CoverLetter | null) {
  return mapApplicationToBuilderState(minimalResume, coverLetter, 'OpenAI', 'AI Support Engineer').cover
}

describe('mapApplicationToBuilderState — cover letter mapping', () => {
  it('maps greeting directly from structured object', () => {
    const cl: CoverLetter = {
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['First paragraph.', 'Second paragraph.'],
      signoff: { name: 'Nelson Lamounier', email: 'n@example.com', linkedin: 'linkedin.com/in/nelson', github: 'github.com/nelson' },
    }

    const cover = buildCover(cl)

    expect(cover.greeting).toBe('Dear Hiring Manager,')
  })

  it('joins paragraphs with double newline for renderer split', () => {
    const cl: CoverLetter = {
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['First paragraph about my background.', 'Second paragraph about the role.'],
      signoff: { name: 'Nelson Lamounier', email: 'n@example.com', linkedin: '', github: '' },
    }

    const cover = buildCover(cl)

    expect(cover.body).toBe('First paragraph about my background.\n\nSecond paragraph about the role.')
    // Renderers split body on a blank line — must yield 2 paragraphs
    expect(cover.body.split(/\n\s*\n/).filter(Boolean)).toHaveLength(2)
  })

  it('assembles closing from signoff fields', () => {
    const cl: CoverLetter = {
      greeting: 'Dear Team,',
      paragraphs: ['Body.'],
      signoff: { name: 'Nelson Lamounier', email: 'n@example.com', linkedin: 'linkedin.com/in/nelson', github: 'github.com/nelson' },
    }

    const cover = buildCover(cl)

    expect(cover.closing).toContain('Nelson Lamounier')
    expect(cover.closing).toContain('n@example.com')
  })

  it('falls back to defaults when cover letter is null', () => {
    const cover = buildCover(null)

    expect(cover.greeting).toBe('Dear Hiring Manager,')
    expect(cover.body).toBe('')
    expect(cover.company).toBe('OpenAI')
  })

  it('sets company and role from arguments regardless of cover letter', () => {
    const cover = buildCover(null)

    expect(cover.company).toBe('OpenAI')
    expect(cover.recipientTitle).toBe('AI Support Engineer')
  })
})
