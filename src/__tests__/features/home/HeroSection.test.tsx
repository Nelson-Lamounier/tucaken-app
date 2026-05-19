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

  it('renders eyebrow, headline, founder note and both CTAs', () => {
    render(<HeroSection />)
    expect(screen.getByText(hero.eyebrow)).toBeTruthy()
    expect(screen.getByText(/already proves/i)).toBeTruthy()
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

  it('renders the parallax stage layers', () => {
    const { container } = render(<HeroSection />)
    expect(container.querySelector('[data-layer="copy"]')).toBeTruthy()
    expect(container.querySelector('[data-layer="core"]')).toBeTruthy()
  })
})
