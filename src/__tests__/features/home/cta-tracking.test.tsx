// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ trackCtaClick: vi.fn(), transitionTo: vi.fn() }))
vi.mock('@/lib/observability/analytics', () => ({ trackCtaClick: mocks.trackCtaClick }))
vi.mock('@/contexts/PageTransition', () => ({
  usePageTransition: () => ({ transitionTo: mocks.transitionTo, isPending: false }),
}))

import { HeroSection } from '@/features/home/sections/HeroSection'
import { Header } from '@/features/home/HomePage'
import { hero } from '@/features/home/content'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CTA tracking', () => {
  it('hero primary CTA tracks (primaryCta label, hero) and still navigates', () => {
    render(<HeroSection />)
    fireEvent.click(screen.getByText(new RegExp(hero.primaryCta, 'i')))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith(hero.primaryCta, 'hero')
    expect(mocks.transitionTo).toHaveBeenCalled()
  })

  it('header "Try free" tracks (Try free, header)', () => {
    render(<Header />)
    fireEvent.click(screen.getByText('Try free'))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith('Try free', 'header')
    expect(mocks.transitionTo).toHaveBeenCalled()
  })

  it('header "Sign in" tracks (Sign in, header)', () => {
    render(<Header />)
    fireEvent.click(screen.getByText('Sign in'))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith('Sign in', 'header')
    expect(mocks.transitionTo).toHaveBeenCalled()
  })
})
