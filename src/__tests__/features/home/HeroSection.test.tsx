/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

import { HeroSection } from '@/features/home/sections/HeroSection'
import { hero, repos } from '@/features/home/content'

describe('HeroSection', () => {
  beforeEach(() => navigateMock.mockReset())

  it('renders eyebrow, headline, founder note and both CTAs', () => {
    const { container } = render(<HeroSection />)
    expect(screen.getByText(hero.eyebrow)).toBeTruthy()
    // KineticText splits headline into per-word spans — check container text content
    expect(container.textContent).toMatch(/already proves/i)
    expect(screen.getByText(hero.founderNote)).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(hero.primaryCta, 'i') })).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(hero.secondaryCta, 'i') })).toBeTruthy()
  })

  it('both CTAs navigate to /sign-in', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<HeroSection />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(hero.primaryCta, 'i') }))
    await userEvent.click(screen.getByRole('button', { name: new RegExp(hero.secondaryCta, 'i') }))
    expect(navigateMock).toHaveBeenCalledTimes(2)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in' })
  })

  it('renders repo marquee bands with repo card content', () => {
    const { container } = render(<HeroSection />)
    // Marquee bands are present
    expect(container.querySelectorAll('.marquee-anim').length).toBeGreaterThan(0)
    // At least one repo name from the repos content is rendered
    expect(container.textContent).toContain(repos[0].name)
  })
})
