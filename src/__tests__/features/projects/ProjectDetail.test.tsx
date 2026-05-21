/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getProjectDetailMock = vi.fn()
vi.mock('@/server/projects', () => ({
  listProjectsFn:     vi.fn(),
  getProjectDetailFn: (args: unknown) => getProjectDetailMock(args),
}))

import { ProjectDetail } from '@/features/projects/components/detail/ProjectDetail'
import type { ProjectDetail as ProjectDetailType } from '@/features/projects/lib/types'

const ID = '11111111-1111-1111-1111-111111111111'

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProjectDetail projectId={ID} />
    </QueryClientProvider>,
  )
}

function makeDetail(overrides: Partial<ProjectDetailType> = {}): ProjectDetailType {
  const now = new Date().toISOString()
  return {
    id:                       ID,
    slug:                     'demo',
    name:                     'Demo Project',
    tagline:                  'A sample project',
    pitch:                    'Pitch paragraph.',
    type:                     'production_saas',
    shape:                    'multi_repo',
    status:                   'active',
    role_exhibited:           'sole_builder',
    visibility:               'private',
    is_ai_suggested:          false,
    is_user_confirmed:        true,
    case_study_status:        'complete',
    case_study_generated_at:  now,
    last_activity_at:         now,
    started_at:               null,
    ended_at:                 null,
    created_at:               now,
    updated_at:               now,
    repository_count:         3,
    proposal_reasoning:       null,
    proposal_confidence:      null,
    proposal_pipeline_run_id: null,
    user_overrides:           {},
    components:               [],
    repositories:             [],
    decisions:                [],
    highlights:               [],
    challenges:               [],
    stack_items:              [],
    depth_markers:            null,
    architecture:             null,
    resume_bullets:           [],
    tags:                     [],
    ...overrides,
  }
}

describe('ProjectDetail', () => {
  beforeEach(() => getProjectDetailMock.mockReset())

  it('renders skeleton while loading', () => {
    getProjectDetailMock.mockReturnValueOnce(new Promise(() => {}))
    renderWithClient()
    expect(screen.getByLabelText(/loading project detail/i)).toBeTruthy()
  })

  it('renders hero and pitch on success', async () => {
    getProjectDetailMock.mockResolvedValueOnce(makeDetail({ name: 'Atlas', pitch: 'Atlas pitch.' }))
    renderWithClient()
    await waitFor(() => screen.getByText('Atlas'))
    expect(screen.getByText('Atlas pitch.')).toBeTruthy()
  })

  it('renders error state on failure', async () => {
    getProjectDetailMock.mockRejectedValueOnce(new Error('boom'))
    renderWithClient()
    await waitFor(() => screen.getByText(/couldn't load project/i))
    expect(screen.getByText('boom')).toBeTruthy()
  })

  it('renders empty hints when sections have no data', async () => {
    getProjectDetailMock.mockResolvedValueOnce(makeDetail({ pitch: null }))
    renderWithClient()
    await waitFor(() => screen.getByText(/pitch hasn't been generated yet/i))
    expect(screen.getByText(/no stack items recorded yet/i)).toBeTruthy()
    expect(screen.getByText(/no decisions extracted yet/i)).toBeTruthy()
    expect(screen.getByText(/depth analysis hasn't run yet/i)).toBeTruthy()
    expect(screen.getByText(/resume bullets haven't been generated yet/i)).toBeTruthy()
  })
})
