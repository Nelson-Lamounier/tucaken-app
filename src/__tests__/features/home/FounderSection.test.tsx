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
  it('renders the founder name and role', () => {
    render(<FounderSection />)
    expect(screen.getByText(founder.name)).toBeTruthy()
    expect(screen.getByText(founder.role)).toBeTruthy()
  })

  it('renders the quote inside a blockquote with the highlighted phrase', () => {
    const { container } = render(<FounderSection />)
    expect(container.querySelector('blockquote')).not.toBeNull()
    expect(container.textContent).toContain('I built Tucaken Resumes because')
    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('Tucaken Resumes')
  })
})
