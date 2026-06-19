/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listProjectsMock = vi.fn()
const confirmMock = vi.fn()
const archiveMock = vi.fn()
const runClusteringMock = vi.fn()
const meMock = vi.fn()

vi.mock('@/server/projects', () => ({
  listProjectsFn:      (args: unknown) => listProjectsMock(args),
  getProjectDetailFn:  vi.fn(),
  patchProjectFn:      vi.fn(() => Promise.resolve({ updated: 1 })),
  confirmProjectFn:    (args: unknown) => confirmMock(args),
  archiveProjectFn:    (args: unknown) => archiveMock(args),
  runClusteringFn:     (args: unknown) => runClusteringMock(args),
}))

vi.mock('@/server/me', () => ({
  getMeFn: () => meMock(),
}))

function me(effectivePlan: 'pro' | 'trial' | 'free') {
  return {
    id: 'u', email: 'u@example.com', isNew: false,
    plan: {
      plan: effectivePlan, effectivePlan, role: 'user',
      trialStartedAt: null, trialEndsAt: null, trialDaysRemaining: null,
      subscriptionStatus: null, stripeCustomerId: null, stripeSubscriptionId: null,
      cancelAtPeriodEnd: false, currentPeriodEnd: null,
    },
  }
}

import { ProjectReviewStep } from '@/features/projects/components/review/ProjectReviewStep'
import type { ProjectSummary } from '@/features/projects/lib/types'

function proposal(id: string, name: string): ProjectSummary {
  const now = new Date().toISOString()
  return {
    id, slug: name.toLowerCase(), name, tagline: null,
    type: 'side_project', shape: 'multi_repo', status: 'active',
    role_exhibited: 'sole_builder', visibility: 'private',
    is_ai_suggested: true, is_user_confirmed: false,
    case_study_status: null, case_study_generated_at: null,
    last_activity_at: now, started_at: null, ended_at: null,
    created_at: now, updated_at: now, repository_count: 2,
    latest_repo_sync_at: null, case_study_stale: false,
  }
}

function renderStep() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProjectReviewStep />
    </QueryClientProvider>,
  )
}

describe('ProjectReviewStep', () => {
  beforeEach(() => {
    listProjectsMock.mockReset()
    confirmMock.mockReset().mockResolvedValue({ confirmed: true, dispatched: true, projectId: 'x' })
    archiveMock.mockReset().mockResolvedValue({ archived: true })
    runClusteringMock.mockReset().mockResolvedValue({ status: 'queued', pipelineRunId: 'p', jobName: 'j' })
    meMock.mockReset().mockResolvedValue(me('pro'))
  })

  it('renders the all-reviewed empty state when there are no proposals', async () => {
    listProjectsMock.mockResolvedValueOnce({ total: 0, limit: 100, offset: 0, items: [] })
    renderStep()
    await waitFor(() => screen.getByText(/no proposals to review/i))
  })

  it('lists proposals with accept and reject actions', async () => {
    listProjectsMock.mockResolvedValueOnce({
      total: 2, limit: 100, offset: 0,
      items: [proposal('a', 'Alpha'), proposal('b', 'Beta')],
    })
    renderStep()
    await waitFor(() => screen.getByText('Alpha'))
    expect(screen.getAllByRole('button', { name: /accept/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /reject/i })).toHaveLength(2)
  })

  it('calls confirmProjectFn when Accept is clicked', async () => {
    listProjectsMock.mockResolvedValueOnce({
      total: 1, limit: 100, offset: 0, items: [proposal('a', 'Alpha')],
    })
    renderStep()
    await waitFor(() => screen.getByText('Alpha'))
    await userEvent.click(screen.getByRole('button', { name: /accept/i }))
    expect(confirmMock).toHaveBeenCalledWith({ data: 'a' })
  })

  it('calls archiveProjectFn when Reject is clicked', async () => {
    listProjectsMock.mockResolvedValueOnce({
      total: 1, limit: 100, offset: 0, items: [proposal('a', 'Alpha')],
    })
    renderStep()
    await waitFor(() => screen.getByText('Alpha'))
    await userEvent.click(screen.getByRole('button', { name: /reject/i }))
    expect(archiveMock).toHaveBeenCalledWith({ data: 'a' })
  })

  it('triggers clustering from the empty state', async () => {
    listProjectsMock.mockResolvedValue({ total: 0, limit: 100, offset: 0, items: [] })
    renderStep()
    await waitFor(() => screen.getByText(/no proposals to review/i))
    await userEvent.click(screen.getByRole('button', { name: /re-run detection/i }))
    expect(runClusteringMock).toHaveBeenCalled()
  })

  it('hides the run-clustering trigger for a free-plan user', async () => {
    meMock.mockResolvedValue(me('free'))
    listProjectsMock.mockResolvedValue({ total: 0, limit: 100, offset: 0, items: [] })
    renderStep()
    await waitFor(() => screen.getByText(/no proposals to review/i))
    await waitFor(() =>
      expect(meMock).toHaveBeenCalled(),
    )
    expect(screen.queryByRole('button', { name: /re-run detection/i })).toBeNull()
  })

  it('shows the run-clustering trigger for a pro-plan user', async () => {
    meMock.mockResolvedValue(me('pro'))
    listProjectsMock.mockResolvedValue({ total: 0, limit: 100, offset: 0, items: [] })
    renderStep()
    await waitFor(() => screen.getByText(/no proposals to review/i))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /re-run detection/i })).toBeTruthy(),
    )
  })
})
