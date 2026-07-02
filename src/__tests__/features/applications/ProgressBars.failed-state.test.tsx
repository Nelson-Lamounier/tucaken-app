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
vi.mock('@/hooks/use-admin-applications', () => ({
  useApplicationDetail: () => detailMock(),
  usePipelineRunStatus: () => null,
}))

describe('ProgressBars — stalled (failed / timed out) state', () => {
  it('shows a details link and no running stage when the run timed out (status still analysing)', () => {
    detailMock.mockReturnValue({ data: { status: 'analysing' }, timedOut: true })
    render(<ProgressBars slug="app-1" startedAt={Date.now()} />)

    expect(screen.getByText('Build timed out')).toBeTruthy()
    // The stepper must not leave a stage spinning as "running".
    expect(screen.queryByText('running')).toBeNull()
    // Stalled runs link to the detail page (the dead "Retry via DLQ" button was removed).
    expect(screen.getByText('View details →')).toBeTruthy()
  })

  it('shows a details link and no running stage when the run failed', () => {
    detailMock.mockReturnValue({ data: { status: 'failed' }, timedOut: false })
    render(<ProgressBars slug="app-1" startedAt={Date.now()} />)

    expect(screen.getByText('Build failed')).toBeTruthy()
    expect(screen.queryByText('running')).toBeNull()
    expect(screen.getByText('View details →')).toBeTruthy()
  })

  it('keeps a running stage while the run is genuinely in progress', () => {
    detailMock.mockReturnValue({ data: { status: 'analysing' }, timedOut: false })
    render(<ProgressBars slug="app-1" startedAt={Date.now()} />)

    expect(screen.getByText('Building your resume')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
    // Not stalled → the results link, not the details link.
    expect(screen.getByText('View results →')).toBeTruthy()
    expect(screen.queryByText('View details →')).toBeNull()
  })
})
