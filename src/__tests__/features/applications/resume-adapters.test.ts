import { describe, it, expect } from 'vitest'
import {
  mapApplicationToBuilderState,
  builderStateToResumeData,
  builderStateToCoverLetter,
} from '@/features/applications/utils/resume-adapters'
import type { ResumeData } from '@/lib/resumes/resume-data'
import type { CoverLetter } from '@/lib/types/applications.types'

const resume: ResumeData = {
  profile: { name: 'Nelson', title: 'SWE', location: 'London', email: 'n@x.com', linkedin: 'li', github: 'gh', website: 'w' },
  summary: 'Sum.',
  keyAchievements: [],
  experience: [{ title: 'Eng', company: 'Acme', period: '2024', highlights: ['Did a thing'] } as never],
  certifications: [],
  skills: [{ category: 'Lang', skills: ['TS', 'Go'] } as never],
  education: [],
  projects: [],
}

const coverLetter: CoverLetter = {
  greeting: 'Dear Hiring Manager,',
  paragraphs: ['First para.', 'Second para.'],
  signoff: { name: 'Nelson', email: 'n@x.com', linkedin: 'li', github: 'gh' },
}

describe('reverse adapters', () => {
  it('round-trips resume summary + experience + skills', () => {
    const state = mapApplicationToBuilderState(resume, coverLetter, 'Acme', 'SWE')
    const back = builderStateToResumeData(state)
    expect(back.summary).toBe('Sum.')
    expect(back.experience[0].title).toBe('Eng')
    expect(back.experience[0].highlights).toEqual(['Did a thing'])
    expect(back.skills[0].skills).toEqual(['TS', 'Go'])
  })

  it('round-trips cover letter greeting + paragraphs, preserves fallback signoff', () => {
    const state = mapApplicationToBuilderState(resume, coverLetter, 'Acme', 'SWE')
    const back = builderStateToCoverLetter(state, coverLetter.signoff)
    expect(back.greeting).toBe('Dear Hiring Manager,')
    expect(back.paragraphs).toEqual(['First para.', 'Second para.'])
    expect(back.signoff).toEqual(coverLetter.signoff)
  })
})
