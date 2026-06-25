/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'
import { MIN_JD_LENGTH } from '@/features/applications/components/ApplicationTypes'

vi.mock('@/features/applications/hooks/use-applications-trigger', () => ({
  useApplicationsTrigger: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

// Admin user so the admin-only "Run in Test Mode" control renders.
vi.mock('@/server/me', () => ({
  getMeFn: vi.fn(async () => ({ abFreeTier: false, plan: { role: 'admin' } })),
}))

vi.mock('@/features/applications/components/ResumeMenuSelect', () => ({
  ResumeMenuSelect: () => <div data-testid="resume-menu" />,
}))

vi.mock('@/lib/stores/pipeline-notifications-store', () => ({
  usePipelineNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: vi.fn() }),
}))

// The modal is now app-global, driven by this store. The panel just opens it.
const openProgressMock = vi.fn()
vi.mock('@/lib/stores/progress-modal-store', () => ({
  useProgressModalStore: (selector: (s: unknown) => unknown) =>
    selector({ openProgress: openProgressMock, closeProgress: vi.fn() }),
}))

function renderPanel(props: React.ComponentProps<typeof NewAnalysisPanel>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NewAnalysisPanel {...props} />
    </QueryClientProvider>,
  )
}

async function fillAndTestSubmit() {
  fireEvent.change(screen.getByPlaceholderText('e.g. Revolut'), {
    target: { value: 'Revolut' },
  })
  fireEvent.change(screen.getByPlaceholderText('e.g. Senior DevOps Engineer'), {
    target: { value: 'Senior DevOps Engineer' },
  })
  fireEvent.change(screen.getByPlaceholderText(/Paste the full job description/i), {
    target: { value: 'x'.repeat(MIN_JD_LENGTH + 10) },
  })
  // Test Mode is admin-only and renders after the async `me` query resolves.
  fireEvent.click(await screen.findByLabelText(/Run in Test Mode/i))
  fireEvent.click(screen.getByRole('button', { name: /Start Analysis/i }))
}

describe('NewAnalysisPanel progress modal', () => {
  beforeEach(() => {
    openProgressMock.mockReset()
    localStorage.clear()
  })

  it('opens the global progress modal on submit', async () => {
    renderPanel({ resumeId: 'resume-1', onResumeChange: vi.fn() })

    await fillAndTestSubmit()

    await waitFor(() => expect(openProgressMock).toHaveBeenCalledTimes(1))
    expect(openProgressMock.mock.calls[0][0]).toMatchObject({
      slug: expect.stringMatching(/^mock-/),
    })
  })
})
