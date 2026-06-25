/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

describe('UserDetailPanel', () => {
  it('shows the Stripe customer id', () => {
    render(<UserDetailPanel userId="u1" open onClose={() => {}} />)
    expect(screen.getByText('cus_1')).toBeTruthy()
  })
})
