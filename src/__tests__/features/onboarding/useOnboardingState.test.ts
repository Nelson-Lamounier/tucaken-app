/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboardingState } from '@/features/onboarding/components/onboarding/useOnboardingState'

describe('useOnboardingState', () => {
  it('starts at welcome by default', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.stepId).toBe('welcome')
    expect(result.current.stepIndex).toBe(0)
  })

  it('respects initialStepIndex', () => {
    const { result } = renderHook(() => useOnboardingState(3))
    expect(result.current.stepId).toBe('connect')
  })

  it('clamps initialStepIndex to valid range', () => {
    const { result } = renderHook(() => useOnboardingState(99))
    expect(result.current.stepIndex).toBe(10) // review is last
  })

  it('advances through steps with next()', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.next())
    expect(result.current.stepId).toBe('portfolio')
  })

  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useOnboardingState(10))
    act(() => result.current.next())
    expect(result.current.stepIndex).toBe(10)
  })

  it('goes back with back()', () => {
    const { result } = renderHook(() => useOnboardingState(2))
    act(() => result.current.back())
    expect(result.current.stepId).toBe('portfolio')
  })

  it('does not go back past step 0', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.back())
    expect(result.current.stepIndex).toBe(0)
  })

  it('jumpTo navigates to named step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('repos'))
    expect(result.current.stepId).toBe('repos')
    expect(result.current.stepIndex).toBe(4)
  })

  it('setReposConnected updates data', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.data.reposConnected).toBe(false)
    act(() => result.current.setReposConnected(true))
    expect(result.current.data.reposConnected).toBe(true)
  })

  it('jumpTo navigates to the review step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('review'))
    expect(result.current.stepId).toBe('review')
    expect(result.current.stepIndex).toBe(10)
  })

  it('reaches mirror from processing via next()', () => {
    const { result } = renderHook(() => useOnboardingState(5))
    act(() => result.current.next())
    expect(result.current.stepId).toBe('mirror')
    expect(result.current.stepIndex).toBe(6)
  })

  it('reaches direction from mirror via next()', () => {
    const { result } = renderHook(() => useOnboardingState(6))
    act(() => result.current.next())
    expect(result.current.stepId).toBe('direction')
    expect(result.current.stepIndex).toBe(7)
  })

  it('reaches reconciliation from direction via next()', () => {
    const { result } = renderHook(() => useOnboardingState(7))
    act(() => result.current.next())
    expect(result.current.stepId).toBe('reconciliation')
    expect(result.current.stepIndex).toBe(8)
  })

  it('reaches distill from reconciliation via next()', () => {
    const { result } = renderHook(() => useOnboardingState(8))
    act(() => result.current.next())
    expect(result.current.stepId).toBe('distill')
    expect(result.current.stepIndex).toBe(9)
  })

  it('reaches review as the terminal step via next()', () => {
    const { result } = renderHook(() => useOnboardingState(9))
    act(() => result.current.next())
    expect(result.current.stepId).toBe('review')
    expect(result.current.stepIndex).toBe(10)
  })

  it('orders processing → mirror → direction → reconciliation → distill → review', () => {
    const { result } = renderHook(() => useOnboardingState(5))
    expect(result.current.stepId).toBe('processing')
    act(() => result.current.next())
    expect(result.current.stepId).toBe('mirror')
    act(() => result.current.next())
    expect(result.current.stepId).toBe('direction')
    expect(result.current.stepIndex).toBe(7)
    act(() => result.current.next())
    expect(result.current.stepId).toBe('reconciliation')
    expect(result.current.stepIndex).toBe(8)
    act(() => result.current.next())
    expect(result.current.stepId).toBe('distill')
    act(() => result.current.next())
    expect(result.current.stepId).toBe('review')
  })

  it('back() from distill returns to reconciliation', () => {
    const { result } = renderHook(() => useOnboardingState(9))
    act(() => result.current.back())
    expect(result.current.stepId).toBe('reconciliation')
    expect(result.current.stepIndex).toBe(8)
  })

  it('back() from reconciliation returns to direction', () => {
    const { result } = renderHook(() => useOnboardingState(8))
    act(() => result.current.back())
    expect(result.current.stepId).toBe('direction')
    expect(result.current.stepIndex).toBe(7)
  })

  it('jumpTo navigates to mirror step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('mirror'))
    expect(result.current.stepId).toBe('mirror')
    expect(result.current.stepIndex).toBe(6)
  })

  it('jumpTo navigates to direction step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('direction'))
    expect(result.current.stepId).toBe('direction')
    expect(result.current.stepIndex).toBe(7)
  })

  it('jumpTo navigates to reconciliation step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('reconciliation'))
    expect(result.current.stepId).toBe('reconciliation')
    expect(result.current.stepIndex).toBe(8)
  })

  it('setResumeImportId updates data', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.data.resumeImportId).toBeUndefined()
    act(() => result.current.setResumeImportId('imp-123'))
    expect(result.current.data.resumeImportId).toBe('imp-123')
  })
})
