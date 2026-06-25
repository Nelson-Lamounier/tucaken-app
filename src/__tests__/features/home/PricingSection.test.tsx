// src/__tests__/features/home/PricingSection.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }))
vi.mock('@/server/tier-config', () => ({ getPublicTierConfigFn: vi.fn() }))
// NumberFlow is a custom-element wrapper; stub it to a plain span so digits
// are deterministically assertable in happy-dom.
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { TierPrice, BillingToggle } from '@/features/home/sections/Sections'
import { TIERS } from '@/features/billing/catalog'

const byId = (id: string) => {
  const t = TIERS.find((x) => x.id === id)
  if (!t) throw new Error(`missing tier ${id}`)
  return t
}

beforeEach(() => navigateMock.mockReset())

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

  it('shows annual price + /year when yearly', () => {
    render(<TierPrice tier={byId('pro')} isYearly={true} />)
    expect(screen.getByText('190')).toBeTruthy()
    expect(screen.getByText('/year')).toBeTruthy()
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
