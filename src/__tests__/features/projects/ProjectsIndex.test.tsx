/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))

const listProjectsMock = vi.fn()
vi.mock('@/server/projects', () => ({
  listProjectsFn:     (args: unknown) => listProjectsMock(args),
  getProjectDetailFn: vi.fn(),
}))

import { ProjectsIndex } from '@/features/projects/components/index/ProjectsIndex'
import type { ProjectSummary } from '@/features/projects/lib/types'

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProjectsIndex />
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
    ...overrides,
  }
}

describe('ProjectsIndex', () => {
  beforeEach(() => listProjectsMock.mockReset())

  it('renders skeleton placeholders while loading', () => {
    listProjectsMock.mockReturnValueOnce(new Promise(() => {}))
    renderWithClient()
    expect(screen.getByLabelText(/loading projects/i)).toBeTruthy()
  })

  it('renders empty state when no projects are returned', async () => {
    listProjectsMock.mockResolvedValueOnce({ total: 0, limit: 100, offset: 0, items: [] })
    renderWithClient()
    await waitFor(() => screen.getByText(/no projects yet/i))
  })

  it('renders cards for returned projects', async () => {
    listProjectsMock.mockResolvedValueOnce({
      total: 2,
      limit: 100,
      offset: 0,
      items: [
        makeProject({ name: 'Alpha' }),
        makeProject({ name: 'Beta', type: 'open_source' }),
      ],
    })
    renderWithClient()
    await waitFor(() => screen.getByText('Alpha'))
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('renders error state when query fails', async () => {
    listProjectsMock.mockRejectedValueOnce(new Error('boom'))
    renderWithClient()
    await waitFor(() => screen.getByText(/couldn't load projects/i))
    expect(screen.getByText('boom')).toBeTruthy()
  })
})
