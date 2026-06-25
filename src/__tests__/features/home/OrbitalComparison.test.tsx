// src/__tests__/features/home/OrbitalComparison.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { OrbitalComparison } from '@/features/home/lib/OrbitalComparison'
import type { ComparisonItem } from '@/features/home/content'

const items: ComparisonItem[] = [
  { label: 'Evidence', icon: 'FileSearch', q: 'Q-evidence?', o: 'O-evidence', t: 'T-evidence' },
  { label: 'Tailoring', icon: 'Target', q: 'Q-tailoring?', o: 'O-tailoring', t: 'T-tailoring' },
]

afterEach(cleanup)

describe('OrbitalComparison', () => {
  it('renders a node button per item with its label', () => {
    render(<OrbitalComparison items={items} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(items.length)
    expect(screen.getAllByText('Evidence').length).toBeGreaterThan(0)
  })

  it('toggles aria-expanded on the clicked node (single-open)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<OrbitalComparison items={items} />)
    const [first, second] = screen.getAllByRole('button')
    expect(first.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(first)
    expect(first.getAttribute('aria-expanded')).toBe('true')
    await userEvent.click(second)
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(second.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows every item q/o/t in the accessible static list', () => {
    render(<OrbitalComparison items={items} />)
    for (const item of items) {
      expect(screen.getByText(item.q)).toBeTruthy()
      expect(screen.getByText(item.o)).toBeTruthy()
      expect(screen.getByText(item.t, { exact: false })).toBeTruthy()
    }
  })

  it('renders only the static list under reduced motion (no node buttons)', () => {
    render(
      <MotionConfig reducedMotion="always">
        <OrbitalComparison items={items} />
      </MotionConfig>,
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('Q-evidence?')).toBeTruthy()
  })
})
