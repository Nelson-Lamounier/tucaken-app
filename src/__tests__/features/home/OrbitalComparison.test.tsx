// src/__tests__/features/home/OrbitalComparison.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const motionMock = vi.hoisted(() => ({ reduce: false }))
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => motionMock.reduce }
})

import { OrbitalComparison } from '@/features/home/lib/OrbitalComparison'
import type { ComparisonItem } from '@/features/home/content'

const items: ComparisonItem[] = [
  { label: 'Evidence', icon: 'FileSearch', q: 'Q-evidence?', o: 'O-evidence', t: 'T-evidence' },
  { label: 'Tailoring', icon: 'Target', q: 'Q-tailoring?', o: 'O-tailoring', t: 'T-tailoring' },
]

afterEach(() => { cleanup(); motionMock.reduce = false })

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
    motionMock.reduce = true
    render(<OrbitalComparison items={items} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('Q-evidence?')).toBeTruthy()
  })

  it('renders the outer orbit-path outline ring', () => {
    render(<OrbitalComparison items={items} />)
    expect(screen.getByTestId('orbit-ring-outer')).toBeTruthy()
  })

  it('renders an infinity-symbol path at the hub', () => {
    render(<OrbitalComparison items={items} />)
    const hub = screen.getByTestId('infinity-hub')
    expect(hub.querySelector('path')).not.toBeNull()
  })

  it('still renders one node button per item with the scroll wrapper', () => {
    render(<OrbitalComparison items={items} />)
    expect(screen.getAllByRole('button')).toHaveLength(items.length)
  })
})
