// src/__tests__/features/home/FounderSection.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { FounderSection } from '@/features/home/sections/Sections'
import { founder } from '@/features/home/content'

describe('FounderSection', () => {
  it('renders the founder name and quote', () => {
    const { container } = render(<FounderSection />)
    expect(screen.getByText(founder.name)).toBeTruthy()
    expect(container.textContent).toContain('I built Tucaken because')
  })

  it('renders the quote inside a blockquote element', () => {
    const { container } = render(<FounderSection />)
    expect(container.querySelector('blockquote')).not.toBeNull()
  })
})
