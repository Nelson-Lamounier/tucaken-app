import { describe, it, expect } from 'vitest'
import { clampStage } from '@/features/applications/components/ApplicationDetailContainer'

describe('clampStage', () => {
  const appliedOnly = new Set(['applied'] as const)
  it('keeps an enabled stage', () => {
    expect(clampStage('applied', appliedOnly)).toBe('applied')
  })
  it('clamps a disabled stage to applied', () => {
    expect(clampStage('technical', appliedOnly)).toBe('applied')
  })
  it('keeps a stage that is enabled in a larger set', () => {
    const all = new Set(['applied', 'technical'] as const)
    expect(clampStage('technical', all)).toBe('technical')
  })
})
