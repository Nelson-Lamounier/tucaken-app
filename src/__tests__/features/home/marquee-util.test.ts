/// <reference types="vitest" />
import { repeatForLoop } from '@/features/home/lib/marquee-util'

describe('repeatForLoop', () => {
  it('duplicates the list twice by default for a seamless loop', () => {
    expect(repeatForLoop(['a', 'b'])).toEqual(['a', 'b', 'a', 'b'])
  })

  it('repeats the given number of times', () => {
    expect(repeatForLoop([1], 3)).toEqual([1, 1, 1])
  })

  it('returns an empty array for empty input', () => {
    expect(repeatForLoop([])).toEqual([])
  })
})
