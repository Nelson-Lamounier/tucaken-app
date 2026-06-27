// src/__tests__/features/home/PricingSection.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const transitionMock = vi.fn()
vi.mock('@/contexts/PageTransition', () => ({
  usePageTransition: () => ({ transitionTo: transitionMock, isPending: false }),
}))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: unknown }) => children }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }))
vi.mock('@/server/tier-config', () => ({ getPublicTierConfigFn: vi.fn() }))
// NumberFlow is a custom-element wrapper; stub it to a plain span so digits
// are deterministically assertable in happy-dom.
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { TierPrice, BillingToggle, PricingSection } from '@/features/home/sections/Sections'
import { TIERS } from '@/features/billing/catalog'

const byId = (id: string) => {
  const t = TIERS.find((x) => x.id === id)
  if (!t) throw new Error(`missing tier ${id}`)
  return t
}

beforeEach(() => transitionMock.mockReset())

describe('TierPrice', () => {
  it('renders "Free" for the free tier', () => {
    render(<TierPrice tier={byId('free')} isYearly={false} />)
    expect(screen.getByText('Free')).toBeTruthy()
  })

  it('shows monthly price + /month when not yearly', () => {
    render(<TierPrice tier={byId('pro')} isYearly={false} />)
    expect(screen.getByText('19')).toBeTruthy()
    expect(screen.getByText('/month')).toBeTruthy()
  })

  it('shows "Coming soon" for annual billing (not charged in v1)', () => {
    render(<TierPrice tier={byId('pro')} isYearly={true} />)
    expect(screen.getByText(/coming soon/i)).toBeTruthy()
  })
})

describe('BillingToggle', () => {
  it('calls onChange with the clicked frequency', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const onChange = vi.fn()
    render(<BillingToggle value="monthly" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /annually/i }))
    expect(onChange).toHaveBeenCalledWith('annually')
  })

  it('marks the active option checked', () => {
    render(<BillingToggle value="annually" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /annually/i }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /monthly/i }).getAttribute('aria-checked')).toBe('false')
  })
})

describe('PricingSection', () => {
  it('renders every tier name', () => {
    render(<PricingSection />)
    for (const t of TIERS) {
      const heading = document.getElementById(`tier-${t.id}`)
      expect(heading).not.toBeNull()
      expect(heading?.textContent?.trim().toLowerCase()).toBe(t.name.toLowerCase())
    }
  })

  it('free tier CTA transitions to sign-in', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<PricingSection />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(byId('free').cta, 'i') }))
    expect(transitionMock).toHaveBeenCalledWith({ to: '/sign-in' })
  })

  it('paid tier CTA transitions to checkout with its id', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<PricingSection />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(byId('pro').cta, 'i') }))
    expect(transitionMock).toHaveBeenCalledWith({ to: '/checkout/$tier', params: { tier: 'pro' } })
  })

  it('toggling to annually shows "Coming soon" (annual not charged in v1)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<PricingSection />)
    await userEvent.click(screen.getByRole('radio', { name: /annually/i }))
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0)
  })
})
