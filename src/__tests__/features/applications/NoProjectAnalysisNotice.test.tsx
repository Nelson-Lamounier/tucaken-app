/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

const listProjectsMock = vi.fn()
vi.mock('@/server/projects', () => ({
  listProjectsFn:     (args: unknown) => listProjectsMock(args),
  getProjectDetailFn: vi.fn(),
}))

import { NoProjectAnalysisNotice } from '@/features/applications/components/NoProjectAnalysisNotice'
import type { ProjectSummary } from '@/features/projects/lib/types'

function renderNotice() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NoProjectAnalysisNotice />
    </QueryClientProvider>,
  )
}

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id:                      crypto.randomUUID(),
    slug:                    'demo',
    name:                    'Demo',
    tagline:                 'tagline',
    type:                    'side_project',
    shape:                   'single_repo',
    status:                  'active',
    role_exhibited:          'sole_builder',
    visibility:              'private',
    is_ai_suggested:         false,
    is_user_confirmed:       true,
    case_study_status:       'complete',
    case_study_generated_at: null,
    last_activity_at:        new Date().toISOString(),
    started_at:              null,
    ended_at:                null,
    created_at:              new Date().toISOString(),
    updated_at:              new Date().toISOString(),
    repository_count:        1,
    latest_repo_sync_at:     null,
    case_study_stale:        false,
    post_sync_action:        null,
    ...overrides,
  }
}

describe('NoProjectAnalysisNotice', () => {
  beforeEach(() => listProjectsMock.mockReset())

  it('warns when the user has no curated projects', async () => {
    // Only a raw single-repo default exists — not curated.
    listProjectsMock.mockResolvedValue({
      total: 1,
      limit: 100,
      offset: 0,
      items: [makeProject({ is_user_confirmed: false, is_ai_suggested: false })],
    })
    renderNotice()
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByText(/no project generated/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /generate a project/i }).getAttribute('href')).toBe('/projects')
  })

  it('stays hidden when the user has a curated project', async () => {
    listProjectsMock.mockResolvedValue({
      total: 1,
      limit: 100,
      offset: 0,
      items: [makeProject({ is_user_confirmed: true })],
    })
    renderNotice()
    // Give the query a tick to resolve, then assert nothing rendered.
    await waitFor(() => expect(listProjectsMock).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('can be dismissed', async () => {
    listProjectsMock.mockResolvedValue({
      total: 1,
      limit: 100,
      offset: 0,
      items: [makeProject({ is_user_confirmed: false, is_ai_suggested: false })],
    })
    renderNotice()
    const dismiss = await screen.findByRole('button', { name: /dismiss/i })
    await userEvent.click(dismiss)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
