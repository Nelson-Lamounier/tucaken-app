import { describe, it, expect } from 'vitest'
import { buildTailoredMap } from '@/features/applications/hooks/use-tailored-resumes'
import type { TailoredResumeSummary } from '@/server/applications'

const mk = (slug: string): TailoredResumeSummary => ({
  slug, targetCompany: 'C', targetRole: 'R', updatedAt: '2026-01-01',
  data: {} as TailoredResumeSummary['data'], coverLetter: null,
})

describe('buildTailoredMap', () => {
  it('keys entries by slug', () => {
    const m = buildTailoredMap([mk('a'), mk('b')])
    expect(m.get('a')?.slug).toBe('a')
    expect(m.size).toBe(2)
  })
  it('returns an empty map for undefined', () => {
    expect(buildTailoredMap(undefined).size).toBe(0)
  })
})
