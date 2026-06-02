/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

// -------------------------------------------------------------------
// Mocks — factory must not reference outer variables (hoisting)
// -------------------------------------------------------------------

vi.mock('@/server/pipelines', () => ({
  patchStageFn: vi.fn().mockResolvedValue({}),
  triggerCoachFn: vi.fn().mockResolvedValue({}),
}))

vi.mock('@tanstack/react-router', () => ({}))

// Import the mocked function AFTER vi.mock so ESM hoisting resolves correctly.
import { patchStageFn } from '@/server/pipelines'
import { useStageDraft } from '@/features/applications/stages/hooks/useStageDraft'

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

const SLUG = 'acme-sre'
const STAGE = 'phone-screen' as const

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(patchStageFn).mockReset()
  vi.mocked(patchStageFn).mockResolvedValue({})
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('useStageDraft — PATCH storm guard', () => {
  it('does NOT fire a PATCH when the draft has not changed', () => {
    const wrapper = createWrapper()
    renderHook(() => useStageDraft(SLUG, STAGE), { wrapper })

    // Advance past the debounce window twice — no user change.
    act(() => { vi.advanceTimersByTime(900) })
    act(() => { vi.advanceTimersByTime(900) })

    // lastSyncedRef is initialized to the hydrated snapshot on mount.
    // Subsequent runs with the same draft should skip the PATCH.
    expect(patchStageFn).not.toHaveBeenCalled()
  })

  it('fires a PATCH after a user change and does NOT fire again without further changes', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useStageDraft(SLUG, STAGE), { wrapper })

    // Trigger a user change.
    act(() => { result.current.setNotes('hello') })

    // Advance past debounce — should schedule the PATCH call.
    await act(async () => { vi.advanceTimersByTime(900) })

    expect(patchStageFn).toHaveBeenCalledTimes(1)

    // Advance again without any new change — snapshot matches lastSyncedRef, skipped.
    await act(async () => { vi.advanceTimersByTime(900) })
    expect(patchStageFn).toHaveBeenCalledTimes(1)
  })
})

describe('useStageDraft — top-level scheduleAt in PATCH', () => {
  it('includes top-level scheduleAt when a date is set', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useStageDraft(SLUG, STAGE), { wrapper })

    const isoDate = '2026-07-01T10:00'
    act(() => { result.current.setSchedule({ scheduleAt: isoDate }) })

    await act(async () => { vi.advanceTimersByTime(900) })

    expect(patchStageFn).toHaveBeenCalledTimes(1)
    const callArg = vi.mocked(patchStageFn).mock.calls[0][0] as { data: Record<string, unknown> }
    // Top-level scheduleAt must be present (not only nested inside userState).
    expect(callArg.data.scheduleAt).toBe(isoDate)
  })

  it('passes scheduleAt: null when scheduleAt is empty', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useStageDraft(SLUG, STAGE), { wrapper })

    act(() => { result.current.setNotes('some note') })

    await act(async () => { vi.advanceTimersByTime(900) })

    expect(patchStageFn).toHaveBeenCalledTimes(1)
    const callArg = vi.mocked(patchStageFn).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(callArg.data.scheduleAt).toBeNull()
  })
})
