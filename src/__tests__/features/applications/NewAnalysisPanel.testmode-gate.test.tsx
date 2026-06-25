/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'
import { getMeFn } from '@/server/me'

vi.mock('@/features/applications/hooks/use-applications-trigger', () => ({
  useApplicationsTrigger: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

vi.mock('@/server/me', () => ({ getMeFn: vi.fn() }))

vi.mock('@/features/applications/components/ResumeMenuSelect', () => ({
  ResumeMenuSelect: () => <div data-testid="resume-menu" />,
}))

vi.mock('@/lib/stores/pipeline-notifications-store', () => ({
  usePipelineNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: vi.fn() }),
}))

vi.mock('@/lib/stores/progress-modal-store', () => ({
  useProgressModalStore: (selector: (s: unknown) => unknown) =>
    selector({ openProgress: vi.fn(), closeProgress: vi.fn() }),
}))

const getMeFnMock = vi.mocked(getMeFn)

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NewAnalysisPanel resumeId="" onResumeChange={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('NewAnalysisPanel "Run in Test Mode" admin gate', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    getMeFnMock.mockReset()
  })

  it('shows Test Mode for admins', async () => {
    getMeFnMock.mockResolvedValue({ abFreeTier: false, plan: { role: 'admin' } } as never)
    renderPanel()
    expect(await screen.findByLabelText(/Run in Test Mode/i)).toBeTruthy()
  })

  it('hides Test Mode for non-admins', async () => {
    getMeFnMock.mockResolvedValue({ abFreeTier: false, plan: { role: 'user' } } as never)
    renderPanel()
    // Wait for the page to settle, then assert the control is absent.
    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Revolut')).toBeTruthy())
    expect(screen.queryByLabelText(/Run in Test Mode/i)).toBeNull()
  })
})
