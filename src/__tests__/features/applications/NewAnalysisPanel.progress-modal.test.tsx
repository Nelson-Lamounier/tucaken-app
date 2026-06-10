/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'
import { MIN_JD_LENGTH } from '@/features/applications/components/ApplicationTypes'

vi.mock('@/features/applications/hooks/use-applications-trigger', () => ({
  useApplicationsTrigger: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

vi.mock('@/features/applications/components/ResumeMenuSelect', () => ({
  ResumeMenuSelect: () => <div data-testid="resume-menu" />,
}))

vi.mock('@/lib/stores/pipeline-notifications-store', () => ({
  usePipelineNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: vi.fn() }),
}))

// Stub the modal so we can observe open/close without the polling internals.
vi.mock('@/features/applications/components/AnalysisProgressModal', () => ({
  AnalysisProgressModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="progress-modal">
        <button type="button" onClick={onClose}>
          close-modal
        </button>
      </div>
    ) : null,
}))

function fillAndTestSubmit() {
  fireEvent.change(screen.getByPlaceholderText('e.g. Revolut'), {
    target: { value: 'Revolut' },
  })
  fireEvent.change(screen.getByPlaceholderText('e.g. Senior DevOps Engineer'), {
    target: { value: 'Senior DevOps Engineer' },
  })
  fireEvent.change(screen.getByPlaceholderText(/Paste the full job description/i), {
    target: { value: 'x'.repeat(MIN_JD_LENGTH + 10) },
  })
  fireEvent.click(screen.getByLabelText(/Run in Test Mode/i))
  fireEvent.click(screen.getByRole('button', { name: /Start Analysis/i }))
}

describe('NewAnalysisPanel progress modal', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('auto-opens the modal on submit and closes it on dismiss', async () => {
    render(<NewAnalysisPanel resumeId="resume-1" onResumeChange={vi.fn()} />)

    fillAndTestSubmit()

    // Auto-opens on submit.
    await waitFor(() => expect(screen.getByTestId('progress-modal')).toBeTruthy())

    // Closing the modal hides it. Tracking/return is handled by the Pipeline
    // Notifications bell (no separate in-page pill).
    fireEvent.click(screen.getByRole('button', { name: 'close-modal' }))
    expect(screen.queryByTestId('progress-modal')).toBeNull()
  })
})
