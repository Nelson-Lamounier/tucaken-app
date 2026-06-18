/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

import { ProjectCard } from '@/features/projects/components/index/ProjectCard'
import type { ProjectSummary } from '@/features/projects/lib/types'

/** Render a card inside a QueryClientProvider — the Update CTA uses a mutation. */
function renderCard(project: ProjectSummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ul>
        <ProjectCard project={project} />
      </ul>
    </QueryClientProvider>,
  )
}

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id:                      '11111111-1111-1111-1111-111111111111',
    slug:                    'demo',
    name:                    'Demo Project',
    tagline:                 'A sample portfolio project',
    type:                    'production_saas',
    shape:                   'multi_repo',
    status:                  'active',
    role_exhibited:          'sole_builder',
    visibility:              'private',
    is_ai_suggested:         false,
    is_user_confirmed:       true,
    case_study_status:       'complete',
    case_study_generated_at: null,
    last_activity_at:        new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    started_at:              null,
    ended_at:                null,
    created_at:              new Date().toISOString(),
    updated_at:              new Date().toISOString(),
    repository_count:        3,
    ...overrides,
  }
}

describe('ProjectCard', () => {
  it('renders name, tagline, status, and repo count', () => {
    renderCard(makeProject())
    expect(screen.getByText('Demo Project')).toBeTruthy()
    expect(screen.getByText('A sample portfolio project')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText(/3 repos/)).toBeTruthy()
  })

  it('falls back to project type label when tagline is null', () => {
    renderCard(makeProject({ tagline: null }))
    expect(screen.getByText('Production SaaS')).toBeTruthy()
  })

  it('uses singular "repo" for repository_count = 1', () => {
    renderCard(makeProject({ repository_count: 1 }))
    expect(screen.getByText(/1 repo$/)).toBeTruthy()
  })

  it('shows the Update CTA for a confirmed, non-archived project', () => {
    renderCard(makeProject())
    expect(screen.getByRole('button', { name: /Update Demo Project/ })).toBeTruthy()
  })

  it('hides the Update CTA for an archived project', () => {
    renderCard(makeProject({ status: 'archived' }))
    expect(screen.queryByRole('button', { name: /Update/ })).toBeNull()
  })
})
