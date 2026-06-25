/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TierConfigSection } from '@/features/account/settings/TierConfigSection'

// vi.mock is hoisted above imports, so the factory must be self-contained.
vi.mock('@/server/tier-config', () => {
  const fixture = {
    tiers: [
      {
        id: 'free',
        name: 'Free',
        blurb: '',
        cta: 'Get started',
        highlighted: false,
        free: true,
        priceMonthly: 0,
        priceAnnual: 0,
        stripePriceIdMonthly: null,
        features: [],
        entitlements: {
          repos: 1,
          projects: 1,
          resumesPerMonth: 1,
          ingestionJobsPerMonth: 3,
          enrichment: 'tier1',
        },
      },
      {
        id: 'pro',
        name: 'Pro',
        blurb: '',
        cta: 'Upgrade',
        highlighted: true,
        free: false,
        priceMonthly: 12,
        priceAnnual: 120,
        stripePriceIdMonthly: 'price_pro',
        features: [],
        entitlements: {
          repos: null,
          projects: null,
          resumesPerMonth: null,
          ingestionJobsPerMonth: null,
          enrichment: 'tier1',
        },
      },
      {
        id: 'premium',
        name: 'Premium',
        blurb: '',
        cta: 'Go Premium',
        highlighted: false,
        free: false,
        priceMonthly: 29,
        priceAnnual: 290,
        stripePriceIdMonthly: 'price_premium',
        features: [],
        entitlements: {
          repos: null,
          projects: null,
          resumesPerMonth: null,
          ingestionJobsPerMonth: null,
          enrichment: 'full',
        },
      },
    ],
  }
  return {
    getTierConfigFn: vi.fn().mockResolvedValue(fixture),
    updateTierConfigFn: vi.fn().mockResolvedValue({ updated: true }),
    listStripePricesFn: vi.fn().mockResolvedValue([]),
  }
})

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('TierConfigSection', () => {
  it('renders the three tier names once loaded', async () => {
    wrap(<TierConfigSection />)
    await waitFor(() => expect(screen.getByDisplayValue('Pro')).toBeTruthy())
    expect(screen.getByDisplayValue('Free')).toBeTruthy()
    expect(screen.getByDisplayValue('Premium')).toBeTruthy()
  })
})
