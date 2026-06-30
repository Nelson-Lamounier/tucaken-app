// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ trackCtaClick: vi.fn(), transitionTo: vi.fn() }))
vi.mock('@/lib/observability/analytics', () => ({ trackCtaClick: mocks.trackCtaClick }))
vi.mock('@/contexts/PageTransition', () => ({
  usePageTransition: () => ({ transitionTo: mocks.transitionTo, isPending: false }),
}))
// No real network: return undefined so tiersFromPublic falls back to default TIERS.
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }))

import { PricingSection } from '@/features/home/sections/Sections'
import { tiersFromPublic } from '@/features/billing/catalog'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PricingSection CTA tracking', () => {
  it('tracks a tier CTA with (tier.cta, pricing_<id>) and navigates', () => {
    const tiers = tiersFromPublic(undefined)
    const first = tiers[0]
    render(<PricingSection />)
    fireEvent.click(screen.getByText(first.cta))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith(first.cta, `pricing_${first.id}`)
    expect(mocks.transitionTo).toHaveBeenCalled()
  })
})
