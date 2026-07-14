import { describe, it, expect } from 'vitest'
import {
  mapApplicationToBuilderState,
  serialiseBuilderSnapshot,
} from '@/features/applications/utils/resume-adapters'
import type { ResumeData as AppResumeData } from '@/lib/resumes/resume-data'

/**
 * The Edit Tailored Resume drawer discards builder state on close. The
 * unsaved-changes guard compares a snapshot taken at load time against the
 * state at close time — it must flag content edits and ignore cosmetic
 * viewer state (view, theme, margins), or every close would prompt.
 */

const resume = {
  profile: {
    name: 'Nelson Lamounier',
    title: 'Engineer',
    location: 'Dublin',
    email: 'n@example.com',
    linkedin: '',
    github: '',
    website: '',
  },
  summary: 'Summary.',
  projects: [],
} as unknown as AppResumeData

function freshState() {
  return mapApplicationToBuilderState(resume, null, 'MongoDB', 'TSE')
}

describe('serialiseBuilderSnapshot', () => {
  it('is stable for an unchanged state', () => {
    const state = freshState()
    expect(serialiseBuilderSnapshot(state)).toBe(serialiseBuilderSnapshot(state))
  })

  it('changes when resume content is edited', () => {
    const state = freshState()
    const before = serialiseBuilderSnapshot(state)
    state.resume.profile.phone = '+353 1 234 5678'
    expect(serialiseBuilderSnapshot(state)).not.toBe(before)
  })

  it('changes when the cover letter is edited', () => {
    const state = freshState()
    const before = serialiseBuilderSnapshot(state)
    state.cover.body = 'Edited body.'
    expect(serialiseBuilderSnapshot(state)).not.toBe(before)
  })

  it('ignores cosmetic viewer state so plain browsing never prompts', () => {
    const state = freshState()
    const before = serialiseBuilderSnapshot(state)
    const cosmetic = { ...state, view: 'cover', theme: 'compact', margins: 1 } as typeof state
    expect(serialiseBuilderSnapshot(cosmetic)).toBe(before)
  })
})
