import { describe, it, expect } from 'vitest'
import {
  baseNodeAngle,
  rotationToTop,
  nodeX,
  nodeY,
  shortestEquivalentAngle,
} from '@/features/home/lib/orbital-geometry'

describe('baseNodeAngle', () => {
  it('places node 0 at the top (-90) and spaces evenly', () => {
    expect(baseNodeAngle(0, 4)).toBe(-90)
    expect(baseNodeAngle(1, 4)).toBe(0)
    expect(baseNodeAngle(2, 4)).toBe(90)
  })
})

describe('rotationToTop', () => {
  it('returns the rotation that brings node i to the top', () => {
    expect(rotationToTop(0, 4)).toBe(-0)
    expect(rotationToTop(1, 4)).toBe(-90)
    expect(rotationToTop(2, 4)).toBe(-180)
  })
})

describe('nodeX / nodeY', () => {
  it('puts a top node (base -90, rotation 0) at (0, -radius)', () => {
    expect(nodeX(-90, 0, 200)).toBeCloseTo(0, 5)
    expect(nodeY(-90, 0, 200)).toBeCloseTo(-200, 5)
  })
  it('puts a right node (base 0, rotation 0) at (radius, 0)', () => {
    expect(nodeX(0, 0, 200)).toBeCloseTo(200, 5)
    expect(nodeY(0, 0, 200)).toBeCloseTo(0, 5)
  })
})

describe('shortestEquivalentAngle', () => {
  it('picks the equivalent target nearest the current angle', () => {
    expect(shortestEquivalentAngle(-90, 350)).toBe(270)
    expect(shortestEquivalentAngle(0, -10)).toBe(0)
    expect(shortestEquivalentAngle(-180, 200)).toBe(180)
  })
})
