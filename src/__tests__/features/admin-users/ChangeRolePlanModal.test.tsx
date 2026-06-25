/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChangeRolePlanModal } from '@/features/admin-users/components/ChangeRolePlanModal'
import type { AdminUserSummary } from '@/features/admin-users/types'

vi.mock('@/features/admin-users/hooks/use-admin-users', () => ({
  useUpdateAdminUser: () => ({ mutate: vi.fn(), isPending: false }),
}))

const USER: AdminUserSummary = {
  id: 'u1',
  email: 'a@x.com',
  fullName: 'A',
  role: 'user',
  plan: 'pro',
  subscriptionStatus: 'active',
  trialEndsAt: null,
  deletedAt: null,
  createdAt: '2026-01-01',
}

describe('ChangeRolePlanModal', () => {
  it('renders the current email when open', () => {
    render(<ChangeRolePlanModal user={USER} open onClose={() => {}} />)
    expect(screen.getByText(/a@x\.com/)).toBeTruthy()
  })
})
