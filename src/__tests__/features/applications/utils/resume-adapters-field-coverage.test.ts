import { describe, it, expect } from 'vitest'
import {
  mapApplicationToBuilderState,
  builderStateToResumeData,
} from '@/features/applications/utils/resume-adapters'
import type { ResumeData as AppResumeData } from '@/lib/resumes/resume-data'

/**
 * Every field the Edit Tailored Resume builder exposes must survive the full
 * round trip: content_json → builder state → saved resume payload. Regression
 * guard for fields the adapters hard-coded on load ('' / []) and omitted on
 * save — edits showed in the preview and download but were never persisted
 * (reported for Phone and Website; the audit found five more).
 */

const fullResume = {
  profile: {
    name: 'Nelson Lamounier',
    title: 'Technical Operations Engineer',
    location: 'Dublin, Ireland',
    email: 'n@example.com',
    phone: '+353 1 234 5678',
    linkedin: 'linkedin.com/in/nelson',
    github: 'github.com/nelson',
    website: 'nelson.dev',
  },
  summary: 'Summary.',
  keyAchievements: [{ achievement: 'Strategist-written achievement.' }],
  experience: [
    {
      company: 'Acme',
      title: 'SRE',
      period: '2022 — Present',
      location: 'Remote, EU',
      highlights: ['Did the thing.'],
    },
  ],
  certifications: [{ name: 'CKA', issuer: 'CNCF', year: '2025' }],
  skills: [{ category: 'Cloud', skills: ['AWS', 'K8s'] }],
  education: [
    {
      degree: 'BSc',
      institution: 'DIT',
      period: '2018 — 2022',
      location: 'Dublin',
      details: 'First class.',
    },
  ],
  projects: [
    {
      name: 'AI Platform',
      description: 'Desc.',
      github: 'github.com/x/ai',
      stack: 'TypeScript, EKS, Bedrock',
      highlights: ['Bullet.'],
    },
  ],
  languages: [{ name: 'English', level: 'Native' }],
  customSections: [
    {
      title: 'Volunteering',
      entries: [{ heading: 'Coder Dojo', subheading: 'Mentor', body: 'Weekly sessions.' }],
    },
  ],
} as AppResumeData

function roundTrip(resume: AppResumeData) {
  const state = mapApplicationToBuilderState(resume, null, 'MongoDB', 'TSE')
  return { state, saved: builderStateToResumeData(state, resume) }
}

describe('profile contact fields round-trip', () => {
  it('loads phone into the builder and saves it back', () => {
    const { state, saved } = roundTrip(fullResume)
    expect(state.resume.profile.phone).toBe('+353 1 234 5678')
    expect(saved.profile.phone).toBe('+353 1 234 5678')
  })

  it('loads website into the builder and saves it back', () => {
    const { state, saved } = roundTrip(fullResume)
    expect(state.resume.profile.website).toBe('nelson.dev')
    expect(saved.profile.website).toBe('nelson.dev')
  })

  it('tolerates legacy profiles without phone', () => {
    const legacy = {
      ...fullResume,
      profile: { ...fullResume.profile, phone: undefined },
    } as AppResumeData
    const { state, saved } = roundTrip(legacy)
    expect(state.resume.profile.phone).toBe('')
    expect(saved.profile.phone).toBe('')
  })
})

describe('experience and education locations round-trip', () => {
  it('preserves experience location', () => {
    const { state, saved } = roundTrip(fullResume)
    expect(state.resume.experience[0]?.location).toBe('Remote, EU')
    expect(saved.experience[0]?.location).toBe('Remote, EU')
  })

  it('preserves education location', () => {
    const { state, saved } = roundTrip(fullResume)
    expect(state.resume.education[0]?.location).toBe('Dublin')
    expect(saved.education[0]?.location).toBe('Dublin')
  })
})

describe('project stack round-trips', () => {
  it('preserves the stack line', () => {
    const { state, saved } = roundTrip(fullResume)
    expect(state.resume.projects[0]?.stack).toBe('TypeScript, EKS, Bedrock')
    expect(saved.projects[0]?.stack).toBe('TypeScript, EKS, Bedrock')
  })
})

describe('languages and custom sections round-trip', () => {
  it('preserves languages', () => {
    const { state, saved } = roundTrip(fullResume)
    expect(state.resume.languages).toEqual([
      expect.objectContaining({ name: 'English', level: 'Native' }),
    ])
    expect(saved.languages).toEqual([{ name: 'English', level: 'Native' }])
  })

  it('preserves custom sections with their entries', () => {
    const { state, saved } = roundTrip(fullResume)
    expect(state.resume.custom[0]?.title).toBe('Volunteering')
    expect(state.resume.custom[0]?.entries[0]).toEqual(
      expect.objectContaining({ heading: 'Coder Dojo', subheading: 'Mentor', body: 'Weekly sessions.' }),
    )
    expect(saved.customSections).toEqual([
      {
        title: 'Volunteering',
        entries: [{ heading: 'Coder Dojo', subheading: 'Mentor', body: 'Weekly sessions.' }],
      },
    ])
  })
})

describe('keyAchievements preservation', () => {
  it('passes strategist keyAchievements through the save unchanged (no builder section exists)', () => {
    const { saved } = roundTrip(fullResume)
    expect(saved.keyAchievements).toEqual([{ achievement: 'Strategist-written achievement.' }])
  })

  it('defaults to an empty array when the original resume is not supplied', () => {
    const state = mapApplicationToBuilderState(fullResume, null, 'MongoDB', 'TSE')
    const saved = builderStateToResumeData(state)
    expect(saved.keyAchievements).toEqual([])
  })
})

describe('double round-trip stability', () => {
  it('is idempotent: a second load/save changes nothing', () => {
    const { saved: once } = roundTrip(fullResume)
    const { saved: twice } = roundTrip(once)
    expect(twice).toEqual(once)
  })
})
