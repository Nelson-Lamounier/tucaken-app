/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const deleteMutate = vi.fn()
const disconnectMutate = vi.fn()
vi.mock('@/features/admin-users/hooks/use-admin-users', () => ({
  useDeleteAdminUser: () => ({ mutate: deleteMutate, isPending: false }),
  useDisconnectAdminUserGithub: () => ({ mutate: disconnectMutate, isPending: false }),
}))

import { DeleteUserModal } from '@/features/admin-users/components/DeleteUserModal'
import type { AdminUserSummary } from '@/features/admin-users/types'

const user: AdminUserSummary = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'jo@example.com',
  fullName: 'Jo',
  role: 'user',
  plan: 'free',
  subscriptionStatus: null,
  trialEndsAt: null,
  deletedAt: null,
  createdAt: '2026-01-01',
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  deleteMutate.mockClear()
  disconnectMutate.mockClear()
})

describe('DeleteUserModal (delete variant)', () => {
  it('keeps hard-delete confirm disabled until the email is typed', () => {
    wrap(<DeleteUserModal variant="delete" user={user} open onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText(/permanently/i))
    const confirm = screen.getByRole('button', { name: /delete account/i }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/type the email/i), { target: { value: 'jo@example.com' } })
    expect(confirm.disabled).toBe(false)
  })

  it('soft-deletes with the reason on confirm', () => {
    wrap(<DeleteUserModal variant="delete" user={user} open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'spam' } })
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    expect(deleteMutate).toHaveBeenCalledWith(
      { id: user.id, mode: 'soft', reason: 'spam' },
      expect.anything(),
    )
  })
})

describe('DeleteUserModal (disconnect variant)', () => {
  it('disconnects github on confirm', () => {
    wrap(<DeleteUserModal variant="disconnect" user={user} open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))
    expect(disconnectMutate).toHaveBeenCalledWith({ id: user.id }, expect.anything())
  })
})
