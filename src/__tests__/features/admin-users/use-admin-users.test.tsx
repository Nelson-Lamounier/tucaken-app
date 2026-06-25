/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/server/admin-users', () => ({
  listAdminUsersFn: vi.fn(async () => [{ id: 'u1', email: 'a@x.com', plan: 'pro', role: 'user' }]),
  getAdminUserFn: vi.fn(),
  updateAdminUserFn: vi.fn(),
  restoreAdminUserFn: vi.fn(),
}))

import { useAdminUsers } from '@/features/admin-users/hooks/use-admin-users'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAdminUsers', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns the user list', async () => {
    const { result } = renderHook(() => useAdminUsers('all'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].email).toBe('a@x.com')
  })
})
