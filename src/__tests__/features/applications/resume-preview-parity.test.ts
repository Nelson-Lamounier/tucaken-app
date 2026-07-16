import { describe, expect, it } from 'vitest'
import { mapApplicationToBuilderState } from '@/features/applications/utils/resume-adapters'
import { getResumeBlocks } from '@/features/resume-theme/app/themes'
import type { ResumeData as AppResumeData } from '@/lib/resumes/resume-data'

/**
 * Preview and Edit now render through the SAME pipeline
 * (mapApplicationToBuilderState -> resume-theme). These tests lock the lead
 * representation: the resume builder, which does not model `keyAchievements`.
 * So a stored resume carrying that section must not surface it in EITHER view.
 */
const rawWithKeyAchievements: AppResumeData = {
  profile: {
    name: 'Nelson', title: 'Engineer', email: 'n@example.com', location: 'Dublin',
    linkedin: '', github: '', website: '',
  },
  summary: 'Builds production AI systems.',
  experience: [{ company: 'Acme', title: 'SRE', period: '2022—now', highlights: ['shipped X'] }],
  skills: [{ category: 'Cloud', skills: ['AWS', 'Kubernetes'] }],
  education: [{ degree: 'BSc', institution: 'Uni', period: '2016—2020' }],
  certifications: [{ name: 'CKA', year: '2023', issuer: 'CNCF' }],
  projects: [],
  keyAchievements: [{ achievement: 'Cut costs 40%' }, { achievement: 'Led migration' }],
  sectionOrder: ['summary', 'keyAchievements', 'experience', 'education', 'skills', 'certifications'],
}

describe('resume preview/edit parity', () => {
  it('builds the canonical builder state without a keyAchievements section', () => {
    const state = mapApplicationToBuilderState(rawWithKeyAchievements, null, 'Acme', 'SRE')
    expect('keyAchievements' in state.resume).toBe(false)
    expect(state.resume.sectionOrder).not.toContain('keyAchievements')
    // The supported sections survive.
    expect(state.resume.sectionOrder).toEqual(
      expect.arrayContaining(['summary', 'experience', 'education', 'skills', 'certifications']),
    )
  })

  it('falls back to the canonical order with skills after certifications when the backend emits none', () => {
    const state = mapApplicationToBuilderState({ ...rawWithKeyAchievements, sectionOrder: [] }, null, 'Acme', 'SRE')
    expect(state.resume.sectionOrder).toEqual([
      'summary',
      'experience',
      'projects',
      'education',
      'certifications',
      'skills',
    ])
  })

  it('honours a backend-emitted order over the canonical fallback', () => {
    const emitted = ['skills', 'summary', 'experience', 'projects', 'education', 'certifications']
    const state = mapApplicationToBuilderState({ ...rawWithKeyAchievements, sectionOrder: emitted }, null, 'Acme', 'SRE')
    expect(state.resume.sectionOrder).toEqual(emitted)
  })

  it('renders no key-achievements block in the resume-theme document', () => {
    const state = mapApplicationToBuilderState(rawWithKeyAchievements, null, 'Acme', 'SRE')
    const blockIds = getResumeBlocks(state.resume).map((b) => b.id).join(' ')
    expect(blockIds.toLowerCase()).not.toMatch(/achiev/)
    expect(getResumeBlocks(state.resume).length).toBeGreaterThan(1)
  })
})
