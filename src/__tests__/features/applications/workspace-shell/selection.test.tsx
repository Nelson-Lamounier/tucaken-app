/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  DetailRailProvider,
  useDetailRail,
} from '@/features/applications/stages/components/workspace-shell/selection'

function wrapper({ children }: { children: ReactNode }) {
  return <DetailRailProvider initialFocus={undefined}>{children}</DetailRailProvider>
}

describe('useDetailRail', () => {
  it('defaults to the detail tab with no selection', () => {
    const { result } = renderHook(() => useDetailRail(), { wrapper })
    expect(result.current.tab).toBe('detail')
    expect(result.current.selected).toBeNull()
  })

  it('selecting a row stores it and forces the detail tab', () => {
    const { result } = renderHook(() => useDetailRail(), { wrapper })
    act(() => result.current.setTab('notes'))
    expect(result.current.tab).toBe('notes')
    act(() =>
      result.current.select({ id: 'caching', label: 'Caching', node: <p>Full text</p> }),
    )
    expect(result.current.tab).toBe('detail')
    expect(result.current.selected?.id).toBe('caching')
  })

  it('honours initialFocus by exposing it as the pending focus id', () => {
    function fwrapper({ children }: { children: ReactNode }) {
      return <DetailRailProvider initialFocus="sharding">{children}</DetailRailProvider>
    }
    const { result } = renderHook(() => useDetailRail(), { wrapper: fwrapper })
    expect(result.current.pendingFocus).toBe('sharding')
  })

  it('clear() resets selected and calls onFocusChange with null', () => {
    const onFocusChange = vi.fn()
    function cwrapper({ children }: { children: ReactNode }) {
      return <DetailRailProvider initialFocus={undefined} onFocusChange={onFocusChange}>{children}</DetailRailProvider>
    }
    const { result } = renderHook(() => useDetailRail(), { wrapper: cwrapper })
    act(() => result.current.select({ id: 'x', label: 'X', node: null }))
    act(() => result.current.clear())
    expect(result.current.selected).toBeNull()
    expect(onFocusChange).toHaveBeenLastCalledWith(null)
  })
})
