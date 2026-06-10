/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ProgressBars } from '@/features/applications/components/ProgressBars'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

const detailMock = vi.fn()
vi.mock('@/hooks/use-admin-applications', () => ({
  useApplicationDetail: () => detailMock(),
  usePipelineRunStatus: () => null,
}))

vi.mock('@/features/applications/hooks/use-application-requeue', () => ({
  useApplicationRequeue: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  }),
}))

describe('ProgressBars onComplete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    detailMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onComplete shortly after the run finishes successfully', () => {
    detailMock.mockReturnValue({ data: { status: 'analysis-ready' }, timedOut: false })
    const onComplete = vi.fn()
    render(<ProgressBars slug="app-1" startedAt={Date.now()} onComplete={onComplete} />)

    // Held so the "Done" state is visible, then fires.
    vi.advanceTimersByTime(2_000)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not call onComplete while the run is still in progress', () => {
    detailMock.mockReturnValue({ data: { status: 'analysing' }, timedOut: false })
    const onComplete = vi.fn()
    render(<ProgressBars slug="app-1" startedAt={Date.now()} onComplete={onComplete} />)

    vi.advanceTimersByTime(3_000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not call onComplete when the run fails', () => {
    detailMock.mockReturnValue({ data: { status: 'failed' }, timedOut: false })
    const onComplete = vi.fn()
    render(<ProgressBars slug="app-1" startedAt={Date.now()} onComplete={onComplete} />)

    vi.advanceTimersByTime(3_000)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
