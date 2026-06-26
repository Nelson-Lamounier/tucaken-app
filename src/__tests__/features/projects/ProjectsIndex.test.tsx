/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))

const listProjectsMock = vi.fn()
const confirmProjectMock = vi.fn()
vi.mock('@/server/projects', () => ({
  listProjectsFn:     (args: unknown) => listProjectsMock(args),
  getProjectDetailFn: vi.fn(),
  confirmProjectFn:   (args: unknown) => confirmProjectMock(args),
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
    post_sync_action:        null,
    ...overrides,
  }
}

describe('ProjectsIndex', () => {
  beforeEach(() => {
    listProjectsMock.mockReset()
    confirmProjectMock.mockReset()
  })

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

  it('offers a Build a project action for a lone single-repo default', async () => {
    const def = makeProject({
      name:              'solo-repo',
      is_user_confirmed: false,
      is_ai_suggested:   false,
      post_sync_action:  null,
      case_study_status: null,
    })
    listProjectsMock.mockResolvedValue({ total: 1, limit: 100, offset: 0, items: [def] })
    confirmProjectMock.mockResolvedValue({ confirmed: true, projectId: def.id })

    renderWithClient()

    const buildBtn = await screen.findByRole('button', { name: /build a project/i })
    await userEvent.click(buildBtn)

    await waitFor(() => expect(confirmProjectMock).toHaveBeenCalledWith({ data: def.id }))
  })

  it('shows only the connect-another CTA when multiple defaults exist (clustering path)', async () => {
    listProjectsMock.mockResolvedValue({
      total: 2,
      limit: 100,
      offset: 0,
      items: [
        makeProject({ name: 'repo-a', is_user_confirmed: false, is_ai_suggested: false, case_study_status: null }),
        makeProject({ name: 'repo-b', is_user_confirmed: false, is_ai_suggested: false, case_study_status: null }),
      ],
    })
    renderWithClient()
    await waitFor(() => screen.getByText(/create your first project/i))
    expect(screen.queryByRole('button', { name: /build a project/i })).toBeNull()
  })

  it('renders error state when query fails', async () => {
    listProjectsMock.mockRejectedValueOnce(new Error('boom'))
    renderWithClient()
    await waitFor(() => screen.getByText(/couldn't load projects/i))
    expect(screen.getByText('boom')).toBeTruthy()
  })
})
