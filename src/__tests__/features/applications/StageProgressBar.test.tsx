/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageProgressBar } from '@/features/applications/stages/components/StageProgressBar'

describe('StageProgressBar gating', () => {
  const enabled = new Set(['applied'] as const)

  it('renders the Applied tab enabled and Technical disabled with a Soon badge', () => {
    render(<StageProgressBar current="applied" active="applied" onSelect={() => {}} enabledStages={enabled} />)
    const applied = screen.getByRole('tab', { name: /^Applied$/ })
    expect(applied.hasAttribute('disabled')).toBe(false)
    const technical = screen.getByRole('tab', { name: /Technical/ })
    expect(technical.hasAttribute('disabled')).toBe(true)
    // "Soon" badge present somewhere on the strip
    expect(screen.getAllByText('Soon').length).toBeGreaterThan(0)
  })

  it('does not fire onSelect for a disabled stage but does for an enabled one', () => {
    const onSelect = vi.fn()
    render(<StageProgressBar current="applied" active="applied" onSelect={onSelect} enabledStages={enabled} />)
    screen.getByRole('tab', { name: /Technical/ }).click()
    expect(onSelect).not.toHaveBeenCalled()
    screen.getByRole('tab', { name: /^Applied$/ }).click()
    expect(onSelect).toHaveBeenCalledWith('applied')
  })
})
