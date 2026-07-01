// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ trackSocialClick: vi.fn() }))
vi.mock('@/lib/observability/analytics', () => ({
  trackSocialClick: mocks.trackSocialClick,
}))
// Footer link columns use the router Link; stub it as a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to?: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

import { FooterSection } from '@/features/home/sections/Sections'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FooterSection social tracking', () => {
  it('tracks the GitHub social click with label + href', () => {
    render(<FooterSection />)
    fireEvent.click(screen.getByLabelText('GitHub'))
    expect(mocks.trackSocialClick).toHaveBeenCalledWith(
      'GitHub',
      'https://github.com/Nelson-Lamounier',
    )
  })

  it('tracks the email icon with platform label Email (not "Email support")', () => {
    render(<FooterSection />)
    fireEvent.click(screen.getByLabelText('Email support'))
    expect(mocks.trackSocialClick).toHaveBeenCalledWith(
      'Email',
      'mailto:support@tucaken.com',
    )
  })

  it('tracks the contact email link', () => {
    render(<FooterSection />)
    fireEvent.click(screen.getByText('support@tucaken.com'))
    expect(mocks.trackSocialClick).toHaveBeenCalledWith(
      'Email',
      'mailto:support@tucaken.com',
    )
  })
})
