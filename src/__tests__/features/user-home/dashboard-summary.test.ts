import { describe, it, expect } from 'vitest'
import { deriveDashboardSummary } from '@/features/user-home/lib/dashboard-summary'
import type { KbStats } from '@/features/user-home/lib/kb-stats'

/** A fully set-up user with a project; tests override one axis at a time. */
function baseStats(overrides: Partial<KbStats> = {}): KbStats {
  return {
    repoCount: 5,
    syncedRepoCount: 5,
    pendingRepoCount: 0,
    careerEntryCount: 12,
    experienceCount: 6,
    educationCount: 2,
    skillCount: 20,
    importCount: 1,
    processedImportCount: 1,
    failedImportCount: 0,
    isReady: true,
    ...overrides,
  }
}

const email = 'lamleao@icloud.com'

describe('deriveDashboardSummary — rule chain (first unmet step wins)', () => {
  it('1. flags a failed import first, with a re-upload action', () => {
    const r = deriveDashboardSummary({ email, hasProject: true, stats: baseStats({ failedImportCount: 1 }) })
    expect(r.summary).toMatch(/re-upload/i)
    expect(r.action).toEqual({ label: 'Re-upload resume', target: 'upload-resume' })
  })

  it('2. with no repos, nudges to connect a repository', () => {
    const r = deriveDashboardSummary({ email, hasProject: false, stats: baseStats({ repoCount: 0, syncedRepoCount: 0, importCount: 0, careerEntryCount: 0, isReady: false }) })
    expect(r.action?.target).toBe('connect-repo')
    expect(r.greeting).toMatch(/welcome aboard/i)
  })

  it('3. with repos but no resume, nudges to upload a resume', () => {
    const r = deriveDashboardSummary({ email, hasProject: false, stats: baseStats({ importCount: 0, careerEntryCount: 0, isReady: false }) })
    expect(r.action).toEqual({ label: 'Upload resume', target: 'upload-resume' })
  })

  it('4. with a resume still processing (no career data), shows no action', () => {
    const r = deriveDashboardSummary({ email, hasProject: false, stats: baseStats({ careerEntryCount: 0, isReady: false }) })
    expect(r.action).toBeNull()
    expect(r.summary).toMatch(/reading it now|career data/i)
  })

  it('5. when not yet ready, reassures with no action', () => {
    const r = deriveDashboardSummary({ email, hasProject: false, stats: baseStats({ isReady: false }) })
    expect(r.action).toBeNull()
    expect(r.greeting).toMatch(/almost there/i)
  })

  it('6. set up but no project, nudges to create a project (the key case)', () => {
    const r = deriveDashboardSummary({ email, hasProject: false, stats: baseStats() })
    expect(r.action).toEqual({ label: 'Create a project', target: 'projects' })
    expect(r.summary).toMatch(/job description/i)
  })

  it('7. fully set up with a project, celebrates and weaves the mirror note', () => {
    const r = deriveDashboardSummary({
      email,
      hasProject: true,
      stats: baseStats({ syncedRepoCount: 3, careerEntryCount: 8 }),
      mirror: 'You are a pragmatic backend engineer. You ship reliable systems.',
    })
    expect(r.action).toEqual({ label: 'View projects', target: 'projects' })
    expect(r.summary).toContain('3 repos')
    expect(r.summary).toContain('8 career entries')
    expect(r.summary).toContain('You are a pragmatic backend engineer.')
    expect(r.summary).not.toContain('You ship reliable systems') // only the first sentence
  })
})

describe('deriveDashboardSummary — name + plural handling', () => {
  it('uses the display name when present', () => {
    const r = deriveDashboardSummary({ name: 'Nelson Lamounier', email, hasProject: true, stats: baseStats() })
    expect(r.greeting).toContain('Nelson')
    expect(r.greeting).not.toContain('Lamounier') // first name only
  })

  it('falls back to the email local part, then to "there"', () => {
    expect(deriveDashboardSummary({ email, hasProject: true, stats: baseStats() }).greeting).toContain('lamleao')
    expect(deriveDashboardSummary({ hasProject: true, stats: baseStats() }).greeting).toContain('there')
  })

  it('uses singular nouns for a count of one', () => {
    const r = deriveDashboardSummary({ email, hasProject: true, stats: baseStats({ syncedRepoCount: 1, careerEntryCount: 1 }) })
    expect(r.summary).toContain('1 repo ')
    expect(r.summary).toContain('1 career entry')
  })
})
