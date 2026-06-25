import { describe, it, expect } from 'vitest'
import { buildStorySlides, activeIndexFromProgress } from '@/features/home/lib/story-data'

describe('buildStorySlides', () => {
  it('returns 6 slides: 3 problem then 3 how, with unique ids', () => {
    const slides = buildStorySlides()
    expect(slides).toHaveLength(6)
    expect(slides.slice(0, 3).every((s) => s.phase === 'problem')).toBe(true)
    expect(slides.slice(3).every((s) => s.phase === 'how')).toBe(true)
    expect(new Set(slides.map((s) => s.id)).size).toBe(6)
  })

  it('assigns the six mock kinds in order', () => {
    expect(buildStorySlides().map((s) => s.mock)).toEqual([
      'commit', 'architecture', 'skim', 'repos', 'jd', 'resume',
    ])
  })
})

describe('activeIndexFromProgress', () => {
  it('maps progress to a clamped slide index', () => {
    expect(activeIndexFromProgress(0, 6)).toBe(0)
    expect(activeIndexFromProgress(1, 6)).toBe(5)
    expect(activeIndexFromProgress(0.5, 6)).toBe(3)
    expect(activeIndexFromProgress(-0.2, 6)).toBe(0)
    expect(activeIndexFromProgress(1.4, 6)).toBe(5)
  })

  it('returns 0 for a non-positive count', () => {
    expect(activeIndexFromProgress(0.5, 0)).toBe(0)
  })
})
