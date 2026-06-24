/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listProjectsMock = vi.fn()
vi.mock('@/server/projects', () => ({
  listProjectsFn:     (args: unknown) => listProjectsMock(args),
  getProjectDetailFn: vi.fn(),
}))

import { MergePanel } from '@/features/projects/components/editor/MergePanel'
import type { ProjectSummary } from '@/features/projects/lib/types'

const TARGET = '11111111-1111-1111-1111-111111111111'

function summary(id: string, name: string): ProjectSummary {
  const now = new Date().toISOString()
  return {
    id, slug: name.toLowerCase(), name, tagline: null,
    type: 'side_project', shape: 'single_repo', status: 'active',
    role_exhibited: 'sole_builder', visibility: 'private',
    is_ai_suggested: false, is_user_confirmed: true,
    case_study_status: 'complete', case_study_generated_at: now,
    last_activity_at: now, started_at: null, ended_at: null,
    created_at: now, updated_at: now, repository_count: 1,
    latest_repo_sync_at: null, case_study_stale: false,
    post_sync_action: null,
  }
}

function renderPanel() {
  const onMerge = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MergePanel targetId={TARGET} targetName="Atlas" isPending={false} error={null} onMerge={onMerge} />
    </QueryClientProvider>,
  )
  return { onMerge }
}

describe('MergePanel', () => {
  beforeEach(() => listProjectsMock.mockReset())

  it('excludes the target project from merge candidates', async () => {
    listProjectsMock.mockResolvedValueOnce({
      total: 2, limit: 100, offset: 0,
      items: [summary(TARGET, 'Atlas'), summary('22222222-2222-2222-2222-222222222222', 'Beta')],
    })
    renderPanel()
    await waitFor(() => screen.getByText('Beta'))
    // Target appears in the header copy but must not be a selectable candidate.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('calls onMerge with the selected source ids', async () => {
    const betaId = '22222222-2222-2222-2222-222222222222'
    listProjectsMock.mockResolvedValueOnce({
      total: 2, limit: 100, offset: 0,
      items: [summary(TARGET, 'Atlas'), summary(betaId, 'Beta')],
    })
    const { onMerge } = renderPanel()
    await waitFor(() => screen.getByText('Beta'))
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /merge/i }))
    expect(onMerge).toHaveBeenCalledWith([betaId])
  })

  it('shows an empty message when there are no other projects', async () => {
    listProjectsMock.mockResolvedValueOnce({
      total: 1, limit: 100, offset: 0, items: [summary(TARGET, 'Atlas')],
    })
    renderPanel()
    await waitFor(() => screen.getByText(/no other projects to merge/i))
  })
})
