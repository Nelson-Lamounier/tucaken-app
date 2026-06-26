import { describe, it, expect } from 'vitest'
import { highlightParts } from '@/features/home/lib/highlight'

describe('highlightParts', () => {
  it('splits around a single occurrence of the term', () => {
    expect(highlightParts('I built Tucaken Resumes today', 'Tucaken Resumes')).toEqual([
      { text: 'I built ', highlight: false },
      { text: 'Tucaken Resumes', highlight: true },
      { text: ' today', highlight: false },
    ])
  })

  it('highlights every occurrence', () => {
    expect(highlightParts('a X b X', 'X')).toEqual([
      { text: 'a ', highlight: false },
      { text: 'X', highlight: true },
      { text: ' b ', highlight: false },
      { text: 'X', highlight: true },
    ])
  })

  it('returns a single plain part when the term is absent', () => {
    expect(highlightParts('hello world', 'zzz')).toEqual([
      { text: 'hello world', highlight: false },
    ])
  })

  it('returns a single plain part when the term is empty', () => {
    expect(highlightParts('hello', '')).toEqual([{ text: 'hello', highlight: false }])
  })
})
