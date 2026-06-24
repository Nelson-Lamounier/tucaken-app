import { describe, it, expect } from 'vitest'
import { splitTokens } from '@/features/home/lib/kinetic-util'

describe('splitTokens', () => {
  it('splits a sentence into words', () => {
    expect(splitTokens('Now your resume can.')).toEqual(['Now', 'your', 'resume', 'can.'])
  })

  it('collapses multiple spaces and trims', () => {
    expect(splitTokens('  a   b ')).toEqual(['a', 'b'])
  })

  it('returns an empty array for an empty string', () => {
    expect(splitTokens('')).toEqual([])
  })
})
