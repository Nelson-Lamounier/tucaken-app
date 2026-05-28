/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboardingState } from '@/features/onboarding/components/onboarding/useOnboardingState'

// Onboarding machine: welcome(0) → resume(1) → connect(2) → processing(3).
// `portfolio` is temporarily unwired (see types.ts). `connect` now also covers
// repo selection (the old `repos` step was merged into it). Completion hands
// off to /overview from OnboardingShell, so there are no post-processing steps.
describe('useOnboardingState', () => {
  it('starts at welcome by default', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.stepId).toBe('welcome')
    expect(result.current.stepIndex).toBe(0)
  })

  it('respects initialStepIndex', () => {
    const { result } = renderHook(() => useOnboardingState(2))
    expect(result.current.stepId).toBe('connect')
  })

  it('clamps initialStepIndex to valid range', () => {
    const { result } = renderHook(() => useOnboardingState(99))
    expect(result.current.stepIndex).toBe(3) // processing is last
    expect(result.current.stepId).toBe('processing')
  })

  it('advances through steps with next()', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.next())
    expect(result.current.stepId).toBe('resume')
  })

  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useOnboardingState(3))
    act(() => result.current.next())
    expect(result.current.stepIndex).toBe(3)
    expect(result.current.stepId).toBe('processing')
  })

  it('goes back with back()', () => {
    const { result } = renderHook(() => useOnboardingState(2))
    act(() => result.current.back())
    expect(result.current.stepId).toBe('resume')
  })

  it('does not go back past step 0', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.back())
    expect(result.current.stepIndex).toBe(0)
  })

  it('jumpTo navigates to named step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('connect'))
    expect(result.current.stepId).toBe('connect')
    expect(result.current.stepIndex).toBe(2)
  })

  it('setReposConnected updates data', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.data.reposConnected).toBe(false)
    act(() => result.current.setReposConnected(true))
    expect(result.current.data.reposConnected).toBe(true)
  })

  it('reaches processing as the terminal step via next()', () => {
    const { result } = renderHook(() => useOnboardingState(2))
    act(() => result.current.next())
    expect(result.current.stepId).toBe('processing')
    expect(result.current.stepIndex).toBe(3)
  })

  it('orders connect → processing', () => {
    const { result } = renderHook(() => useOnboardingState(2))
    expect(result.current.stepId).toBe('connect')
    act(() => result.current.next())
    expect(result.current.stepId).toBe('processing')
    expect(result.current.stepIndex).toBe(3)
  })

  it('back() from processing returns to connect', () => {
    const { result } = renderHook(() => useOnboardingState(3))
    act(() => result.current.back())
    expect(result.current.stepId).toBe('connect')
    expect(result.current.stepIndex).toBe(2)
  })

  it('setResumeImportId updates data', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.data.resumeImportId).toBeUndefined()
    act(() => result.current.setResumeImportId('imp-123'))
    expect(result.current.data.resumeImportId).toBe('imp-123')
  })
})
