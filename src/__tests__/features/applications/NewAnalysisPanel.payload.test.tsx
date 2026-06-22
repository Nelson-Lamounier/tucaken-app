/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'

const mutateMock = vi.fn()
vi.mock('@/features/applications/hooks/use-applications-trigger', () => ({
  useApplicationsTrigger: () => ({ mutate: mutateMock, isPending: false, error: null }),
}))

vi.mock('@/server/me', () => ({ getMeFn: vi.fn(async () => ({ abFreeTier: false })) }))

// Render the selector as a no-op so this test focuses on payload wiring.
vi.mock('@/features/applications/components/ResumeMenuSelect', () => ({
  ResumeMenuSelect: () => <div data-testid="resume-menu" />,
}))

vi.mock('@/lib/stores/pipeline-notifications-store', () => ({
  usePipelineNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: vi.fn() }),
}))

function renderPanel(props: React.ComponentProps<typeof NewAnalysisPanel>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NewAnalysisPanel {...props} />
    </QueryClientProvider>,
  )
}

describe('NewAnalysisPanel payload', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    localStorage.clear()
  })

  it('submits the selected resumeId in the trigger payload', async () => {
    renderPanel({ resumeId: 'resume-xyz', onResumeChange: vi.fn() })

    fireEvent.change(screen.getByPlaceholderText('e.g. Revolut'), {
      target: { value: 'Revolut' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. Senior DevOps Engineer'), {
      target: { value: 'Senior DevOps Engineer' },
    })
    fireEvent.change(
      screen.getByPlaceholderText(/Paste the full job description/i),
      { target: { value: 'x'.repeat(60) } },
    )

    fireEvent.click(screen.getByRole('button', { name: /Start Analysis/i }))

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1))
    expect(mutateMock.mock.calls[0][0]).toMatchObject({
      resumeId: 'resume-xyz',
      targetCompany: 'Revolut',
      targetRole: 'Senior DevOps Engineer',
    })
  })

  it('disables submit while the resume default is unresolved (resumeId null)', () => {
    renderPanel({ resumeId: null, onResumeChange: vi.fn() })

    fireEvent.change(screen.getByPlaceholderText('e.g. Revolut'), {
      target: { value: 'Revolut' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. Senior DevOps Engineer'), {
      target: { value: 'Senior DevOps Engineer' },
    })
    fireEvent.change(
      screen.getByPlaceholderText(/Paste the full job description/i),
      { target: { value: 'x'.repeat(60) } },
    )

    const startButton = screen.getByRole('button', { name: /Start Analysis/i })
    expect(startButton).toHaveProperty('disabled', true)
    expect(mutateMock).not.toHaveBeenCalled()
  })
})
