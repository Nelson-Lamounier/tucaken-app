/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AnalysisProgressModal } from '@/features/applications/components/AnalysisProgressModal'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

const detailMock = vi.fn()
vi.mock('@/hooks/use-admin-applications', () => ({
  useApplicationDetail: () => detailMock(),
  usePipelineRunStatus: () => null,
}))

describe('AnalysisProgressModal completion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    detailMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('navigates to the results page AND closes the modal when the run finishes', () => {
    detailMock.mockReturnValue({ data: { status: 'analysis-ready' }, timedOut: false })
    const onClose = vi.fn()

    render(<AnalysisProgressModal isOpen onClose={onClose} slug="app-1" startedAt={Date.now()} />)

    // ProgressBars holds the "Done" state briefly (3.5s) before calling onComplete.
    vi.advanceTimersByTime(4_000)

    // The redirect must happen…
    expect(navigateMock).toHaveBeenCalledWith({ to: '/applications/$slug', params: { slug: 'app-1' } })
    // …and the modal must dismiss itself so the results page is actually visible
    // (otherwise the backdrop stays over the page and the user has to click it).
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
