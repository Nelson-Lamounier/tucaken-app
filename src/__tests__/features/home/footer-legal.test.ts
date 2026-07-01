import { describe, it, expect } from 'vitest'
import { FOOTER_COLUMNS } from '@/features/home/sections/Sections'

describe('footer legal links', () => {
  it('has a Legal column linking to the three legal pages', () => {
    const legal = FOOTER_COLUMNS.find((c) => c.heading === 'Legal')
    expect(legal).toBeDefined()
    const targets = new Set(legal?.links.map((l) => l.to))
    expect(targets.has('/terms')).toBe(true)
    expect(targets.has('/privacy')).toBe(true)
    expect(targets.has('/cookies')).toBe(true)
  })
})
