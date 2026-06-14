/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mergeProjectsMock = vi.fn()
const regenerateProjectMock = vi.fn()
vi.mock('@/server/projects', () => ({
  mergeProjectsFn:     (args: unknown) => mergeProjectsMock(args),
  regenerateProjectFn: (args: unknown) => regenerateProjectMock(args),
  // other fns imported by the mutations module — unused here
  archiveProjectFn: vi.fn(), confirmProjectFn: vi.fn(), deleteDecisionFn: vi.fn(),
  patchDecisionFn: vi.fn(), patchProjectFn: vi.fn(), runClusteringFn: vi.fn(), splitProjectFn: vi.fn(),
}))

import { useIntegrateRepo } from '@/features/projects/server/mutations'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useIntegrateRepo — auto-regenerate on add', () => {
  beforeEach(() => {
    mergeProjectsMock.mockReset()
    regenerateProjectMock.mockReset()
  })

  it('merges then dispatches a regenerate for the target', async () => {
    mergeProjectsMock.mockResolvedValue({ componentsReassigned: 1, sourcesArchived: 1 })
    regenerateProjectMock.mockResolvedValue({ status: 'queued' })

    const { result } = renderHook(() => useIntegrateRepo(), { wrapper })
    const res = await result.current.mutateAsync({ targetId: 'proj-1', sourceIds: ['repo-default-1'] })

    expect(mergeProjectsMock).toHaveBeenCalledWith({ data: { targetId: 'proj-1', sourceIds: ['repo-default-1'] } })
    expect(regenerateProjectMock).toHaveBeenCalledWith({ data: 'proj-1' })
    expect(res.regenerateDispatched).toBe(true)
  })

  it('still succeeds when the regenerate dispatch fails (merge already happened)', async () => {
    mergeProjectsMock.mockResolvedValue({ componentsReassigned: 1, sourcesArchived: 1 })
    regenerateProjectMock.mockRejectedValue(new Error('job dispatch 500'))

    const { result } = renderHook(() => useIntegrateRepo(), { wrapper })
    const res = await result.current.mutateAsync({ targetId: 'proj-1', sourceIds: ['repo-default-1'] })

    expect(res.regenerateDispatched).toBe(false)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('does not regenerate when the merge itself fails', async () => {
    mergeProjectsMock.mockRejectedValue(new Error('merge 409'))

    const { result } = renderHook(() => useIntegrateRepo(), { wrapper })
    await expect(
      result.current.mutateAsync({ targetId: 'proj-1', sourceIds: ['repo-default-1'] }),
    ).rejects.toThrow('merge 409')
    expect(regenerateProjectMock).not.toHaveBeenCalled()
  })
})
