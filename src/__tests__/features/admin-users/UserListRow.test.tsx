/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserListRow } from '@/features/admin-users/components/UserListRow'
import type { AdminUserSummary } from '@/features/admin-users/types'

const base: AdminUserSummary = {
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

function noop() {}

describe('UserListRow', () => {
  it('renders email and plan', () => {
    render(<UserListRow user={base} onView={noop} onEdit={noop} onRestore={noop} />)
    expect(screen.getByText('a@x.com')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
  })

  it('shows Restore only for a deleted user', () => {
    const { rerender } = render(<UserListRow user={base} onView={noop} onEdit={noop} onRestore={noop} />)
    expect(screen.queryByLabelText('Restore user')).toBeFalsy()
    rerender(
      <UserListRow user={{ ...base, deletedAt: '2026-02-01' }} onView={noop} onEdit={noop} onRestore={noop} />,
    )
    expect(screen.getByLabelText('Restore user')).toBeTruthy()
  })
})
