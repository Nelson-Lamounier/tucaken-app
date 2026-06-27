import { describe, it, expect } from 'vitest'
import { comparison } from '@/features/home/content'

// Mirror of the ICONS map in OrbitalComparison.tsx — keep in sync.
const KNOWN_ICONS = new Set([
  'FileSearch',
  'Target',
  'FileWarning',
  'Fingerprint',
  'Lock',
  'ListChecks',
  'ScanSearch',
  'MessagesSquare',
  'FileDown',
  'LayoutTemplate',
  'LayoutDashboard',
  'FileText',
  'Sparkles',
  'Clock',
])

describe('comparison data', () => {
  it('every item carries label, icon, q, o, t', () => {
    expect(comparison.length).toBeGreaterThan(0)
    for (const item of comparison) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.icon.length).toBeGreaterThan(0)
      expect(item.q.length).toBeGreaterThan(0)
      expect(item.o.length).toBeGreaterThan(0)
      expect(item.t.length).toBeGreaterThan(0)
    }
  })

  it('every icon is a known lucide key', () => {
    for (const item of comparison) {
      expect(KNOWN_ICONS.has(item.icon)).toBe(true)
    }
  })
})
