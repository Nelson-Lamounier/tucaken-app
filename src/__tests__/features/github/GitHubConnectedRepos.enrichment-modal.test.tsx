/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import type { ConnectedRepo } from '@/lib/types/github.types'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const triggerMock = vi.fn()
vi.mock('@/server/github', () => ({
  triggerGitHubIngestionFn: (...args: unknown[]) => triggerMock(...args),
  removeConnectedRepoFn:    vi.fn(),
}))

const getMeFnMock = vi.fn()
vi.mock('@/server/me', () => ({
  getMeFn: (...args: unknown[]) => getMeFnMock(...args),
}))

vi.mock('@/lib/stores/toast-store', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO: ConnectedRepo = {
  repoFullName:  'acme/api',
  owner:         'acme',
  name:          'api',
  defaultBranch: 'main',
  syncStatus:    'complete',
  lastSyncedAt:  '2026-06-01T10:00:00Z',
  addedAt:       '2026-06-01T09:00:00Z',
}

function renderComponent(enrichmentToggle: boolean, repos: ConnectedRepo[] = [REPO]) {
  getMeFnMock.mockResolvedValue({ enrichmentToggle, abFreeTier: false })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GitHubConnectedRepos connectedRepos={repos} />
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubConnectedRepos enrichment modal', () => {
  beforeEach(() => {
    triggerMock.mockReset()
    getMeFnMock.mockReset()
  })

  it('dispatches immediately with no enrichment field when enrichmentToggle is false', async () => {
    triggerMock.mockResolvedValue({ status: 'queued', repoFullName: 'acme/api', jobName: 'j1' })

    renderComponent(false)

    // When toggle is false the `me` query settling does not change canToggle (defaults false).
    // The Re-sync button is available immediately; click it directly.
    const btn = await screen.findByRole('button', { name: /↺ Re-sync/i })
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => expect(triggerMock).toHaveBeenCalledTimes(1))

    const payload = triggerMock.mock.calls[0][0]
    expect(payload.data.enrichment).toBeUndefined()
    expect(payload.data.forceReindex).toBe(false)
  })

  it('opens the enrichment modal when enrichmentToggle is true and re-sync is clicked', async () => {
    renderComponent(true)

    // Wait for the `me` query to resolve and the component to re-render with canToggle=true.
    // The data-testid="enrichment-toggle-active" appears only when canToggle is truthy.
    await screen.findByTestId('enrichment-toggle-active')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /↺ Re-sync/i }))
    })

    // The modal dialog should now be in the document.
    expect(screen.getByText('Choose enrichment tier')).toBeTruthy()
    expect(screen.getByText('Full enrichment (premium)')).toBeTruthy()
    expect(screen.getByText('Free-tier sync')).toBeTruthy()
    // No dispatch should have happened yet.
    expect(triggerMock).not.toHaveBeenCalled()
  })

  it('dispatches with enrichment=premium when the premium option is chosen', async () => {
    triggerMock.mockResolvedValue({ status: 'queued', repoFullName: 'acme/api', jobName: 'j2' })

    renderComponent(true)
    await screen.findByTestId('enrichment-toggle-active')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /↺ Re-sync/i }))
    })
    expect(screen.getByText('Choose enrichment tier')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Full enrichment (premium)'))
    })

    await waitFor(() => expect(triggerMock).toHaveBeenCalledTimes(1))
    expect(triggerMock.mock.calls[0][0].data.enrichment).toBe('premium')
    expect(triggerMock.mock.calls[0][0].data.forceReindex).toBe(false)
  })

  it('dispatches with enrichment=free when the free option is chosen', async () => {
    triggerMock.mockResolvedValue({ status: 'queued', repoFullName: 'acme/api', jobName: 'j3' })

    renderComponent(true)
    await screen.findByTestId('enrichment-toggle-active')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /↺ Re-sync/i }))
    })
    expect(screen.getByText('Choose enrichment tier')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Free-tier sync'))
    })

    await waitFor(() => expect(triggerMock).toHaveBeenCalledTimes(1))
    expect(triggerMock.mock.calls[0][0].data.enrichment).toBe('free')
    expect(triggerMock.mock.calls[0][0].data.forceReindex).toBe(false)
  })

  it('closes the modal without dispatching when Cancel is clicked', async () => {
    renderComponent(true)
    await screen.findByTestId('enrichment-toggle-active')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /↺ Re-sync/i }))
    })
    expect(screen.getByText('Choose enrichment tier')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    })

    await waitFor(() =>
      expect(screen.queryByText('Choose enrichment tier')).toBeNull(),
    )
    expect(triggerMock).not.toHaveBeenCalled()
  })
})
