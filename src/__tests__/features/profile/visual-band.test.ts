import { describe, it, expect } from 'vitest'
import { topLanguages, arcPoints } from '@/features/profile/lib/visual-band'

describe('topLanguages', () => {
  it('returns up to 5 by sharePct desc, [] for empty/undefined', () => {
    const langs = [
      { language: 'TS', sharePct: 60, repoCount: 3, commitVolumeProxy: 1 },
      { language: 'Py', sharePct: 30, repoCount: 1, commitVolumeProxy: 1 },
      { language: 'Go', sharePct: 10, repoCount: 1, commitVolumeProxy: 1 },
    ]
    expect(topLanguages(langs as never).map(l => l.language)).toEqual(['TS','Py','Go'])
    expect(topLanguages([] as never)).toEqual([])
    expect(topLanguages(undefined as never)).toEqual([])
  })
  it('caps at 5', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ language: 'L'+i, sharePct: i, repoCount: 1, commitVolumeProxy: 1 }))
    expect(topLanguages(many as never)).toHaveLength(5)
  })
})

describe('arcPoints', () => {
  it('maps activityArc to {date,language,domain} preserving order; [] for undefined', () => {
    const arc = [{ repoFullName:'o/a', lastActiveAt:'2024-01-01T00:00:00Z', primaryLanguage:'TS', domain:'infra' }]
    expect(arcPoints(arc as never)).toEqual([{ date:'2024-01-01T00:00:00Z', language:'TS', domain:'infra' }])
    expect(arcPoints(undefined as never)).toEqual([])
  })
})
