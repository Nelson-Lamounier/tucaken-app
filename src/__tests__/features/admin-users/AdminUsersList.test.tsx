/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminUsersList } from '@/features/admin-users/components/AdminUsersList'

vi.mock('@/features/admin-users/hooks/use-admin-users', () => ({
  useAdminUsers: () => ({
    data: [
      {
        id: 'u1',
        email: 'a@x.com',
        fullName: 'A',
        role: 'user',
        plan: 'pro',
        subscriptionStatus: 'active',
        trialEndsAt: null,
        deletedAt: null,
        createdAt: '2026-01-01',
      },
    ],
    isLoading: false,
    error: null,
  }),
  useRestoreAdminUser: () => ({ mutate: vi.fn() }),
  useUpdateAdminUser: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminUser: () => ({ data: undefined, isLoading: false }),
}))

describe('AdminUsersList', () => {
  it('renders a user row', () => {
    render(<AdminUsersList />)
    expect(screen.getByText('a@x.com')).toBeTruthy()
  })
})
