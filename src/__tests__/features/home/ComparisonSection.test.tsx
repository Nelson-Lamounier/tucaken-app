// src/__tests__/features/home/ComparisonSection.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Sections.tsx imports NumberFlow at module scope (custom element); stub it.
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { ComparisonSection } from '@/features/home/sections/Sections'
import { comparison } from '@/features/home/content'

describe('ComparisonSection', () => {
  it('renders the heading and one orbital node per comparison item', () => {
    const { container } = render(<ComparisonSection />)
    // KineticText splits the heading into per-word spans — assert on text content.
    expect(container.textContent).toMatch(/other AI resume tools/i)
    expect(screen.getAllByRole('button')).toHaveLength(comparison.length)
  })
})
