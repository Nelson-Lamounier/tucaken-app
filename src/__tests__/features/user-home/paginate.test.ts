import { describe, it, expect } from 'vitest'
import { paginate } from '@/features/user-home/lib/paginate'

describe('paginate', () => {
  it('returns the first page bounds for a multi-page list', () => {
    expect(paginate(12, 0, 5)).toEqual({ pageCount: 3, safePage: 0, start: 0, end: 5 })
  })

  it('returns a middle page', () => {
    expect(paginate(12, 1, 5)).toEqual({ pageCount: 3, safePage: 1, start: 5, end: 10 })
  })

  it('caps the last page end at the total', () => {
    expect(paginate(12, 2, 5)).toEqual({ pageCount: 3, safePage: 2, start: 10, end: 12 })
  })

  it('clamps a page beyond the last to the last page', () => {
    expect(paginate(12, 99, 5)).toEqual({ pageCount: 3, safePage: 2, start: 10, end: 12 })
  })

  it('clamps a negative page to the first page', () => {
    expect(paginate(12, -3, 5)).toEqual({ pageCount: 3, safePage: 0, start: 0, end: 5 })
  })

  it('reports a single page when the list fits', () => {
    expect(paginate(3, 0, 5)).toEqual({ pageCount: 1, safePage: 0, start: 0, end: 3 })
  })

  it('handles an empty list as one empty page', () => {
    expect(paginate(0, 0, 5)).toEqual({ pageCount: 1, safePage: 0, start: 0, end: 0 })
  })
})
