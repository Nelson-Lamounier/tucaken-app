/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBars } from '@/features/applications/components/ProgressBars'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

const detailMock = vi.fn()
const pipelineRunMock = vi.fn()
vi.mock('@/hooks/use-admin-applications', () => ({
  useApplicationDetail: () => detailMock(),
  usePipelineRunStatus: () => pipelineRunMock(),
}))

vi.mock('@/features/applications/hooks/use-application-requeue', () => ({
  useApplicationRequeue: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null }),
}))

describe('ProgressBars — recovery after a premature timeout', () => {
  it('shows the success state (not "timed out") when the run completes after the UI timed out', () => {
    // The detail hook gave up (timed out) while the app status still reads
    // "analysing" — but the pipeline run itself finished.
    detailMock.mockReturnValue({ data: { status: 'analysing' }, timedOut: true })
    pipelineRunMock.mockReturnValue({ status: 'complete' })

    render(<ProgressBars slug="app-1" pipelineRunId="run-1" startedAt={Date.now()} />)

    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Your tailored resume and analysis are ready.')).toBeTruthy()
    expect(screen.queryByText('Build timed out')).toBeNull()
    expect(screen.queryByText('Retry via DLQ')).toBeNull()
  })

  it('still shows the timed-out + Retry state when the run has not completed', () => {
    detailMock.mockReturnValue({ data: { status: 'analysing' }, timedOut: true })
    pipelineRunMock.mockReturnValue(null) // no pipeline-run signal yet

    render(<ProgressBars slug="app-1" pipelineRunId="run-1" startedAt={Date.now()} />)

    expect(screen.getByText('Build timed out')).toBeTruthy()
    expect(screen.getByText('Retry via DLQ')).toBeTruthy()
    expect(screen.queryByText('Done')).toBeNull()
  })
})
