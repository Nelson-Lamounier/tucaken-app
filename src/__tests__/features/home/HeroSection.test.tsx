/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

import { HeroSection } from '@/features/home/sections/HeroSection'
import { hero } from '@/features/home/content'

describe('HeroSection', () => {
  beforeEach(() => navigateMock.mockReset())

  it('renders eyebrow, headline lead, founder note and the primary CTA', () => {
    const { container } = render(<HeroSection />)
    expect(screen.getByText(hero.eyebrow)).toBeTruthy()
    expect(container.textContent).toContain(hero.headlineLead)
    expect(screen.getByText(hero.founderNote)).toBeTruthy()
    expect(screen.getByRole('button', { name: /connect github/i })).toBeTruthy()
  })

  it('renders every rotating headline word', () => {
    const { container } = render(<HeroSection />)
    for (const word of hero.rotatingWords) {
      expect(container.textContent).toContain(word)
    }
  })

  it('primary CTA navigates to /sign-in', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<HeroSection />)
    await userEvent.click(screen.getByRole('button', { name: /connect github/i }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in' })
  })
})
