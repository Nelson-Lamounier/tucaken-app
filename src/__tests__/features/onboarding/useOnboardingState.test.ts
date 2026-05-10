/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboardingState } from '../../../features/onboarding/components/onboarding/useOnboardingState'

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
    expect(result.current.stepIndex).toBe(5) // processing is last
  })

  it('advances through steps with next()', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.next())
    expect(result.current.stepId).toBe('portfolio')
  })

  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useOnboardingState(5))
    act(() => result.current.next())
    expect(result.current.stepIndex).toBe(5)
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
})
