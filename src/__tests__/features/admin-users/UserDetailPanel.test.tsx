/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserDetailPanel } from '@/features/admin-users/components/UserDetailPanel'

vi.mock('@/features/admin-users/hooks/use-admin-users', () => ({
  useAdminUser: () => ({
    data: {
      id: 'u1',
      email: 'a@x.com',
      fullName: 'A',
      role: 'user',
      plan: 'pro',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      deletedAt: null,
      createdAt: '2026-01-01',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      quotas: [],
    },
    isLoading: false,
  }),
}))

// UserRagSection (rendered inside the panel) fetches the user's repos + diagnostic.
vi.mock('@/server/admin-users', () => ({
  getUserRepositoriesFn: vi.fn(() => Promise.resolve([])),
  getUserDiagnosticFn:   vi.fn(() => Promise.resolve({ diagnostic: null, refreshedAt: null })),
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('UserDetailPanel', () => {
  it('shows the Stripe customer id', () => {
    renderWithClient(<UserDetailPanel userId="u1" open onClose={() => {}} />)
    expect(screen.getByText('cus_1')).toBeTruthy()
  })
})
