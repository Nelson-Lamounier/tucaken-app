import { describe, it, expect } from 'vitest'
import { nodeAngles, nodeTransform } from '@/features/home/lib/orbital-geometry'

describe('nodeAngles', () => {
  it('returns evenly spaced angles starting at -90', () => {
    expect(nodeAngles(4)).toEqual([-90, 0, 90, 180])
  })
  it('returns [] for non-positive counts', () => {
    expect(nodeAngles(0)).toEqual([])
  })
})

describe('nodeTransform', () => {
  it('positions a node on the ring and keeps it upright', () => {
    expect(nodeTransform(90, 200)).toBe('rotate(90deg) translateX(200px) rotate(-90deg)')
  })
})
