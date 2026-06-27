import { describe, it, expect } from 'vitest'
import { buildFloatingPaths } from '@/components/ui/floating-paths-util'

describe('buildFloatingPaths', () => {
  it('returns 36 deterministic path descriptors', () => {
    const a = buildFloatingPaths(1)
    expect(a).toHaveLength(36)
    expect(buildFloatingPaths(1)).toEqual(a) // deterministic, no Math.random
  })

  it('encodes the position into the path data and ids', () => {
    expect(buildFloatingPaths(1)[0].id).toBe(0)
    expect(buildFloatingPaths(1)[0].d).not.toEqual(buildFloatingPaths(-1)[0].d)
  })

  it('width and opacity grow with index', () => {
    const p = buildFloatingPaths(1)
    expect(p[10].width).toBeGreaterThan(p[0].width)
    expect(p[10].opacity).toBeGreaterThan(p[0].opacity)
  })
})
