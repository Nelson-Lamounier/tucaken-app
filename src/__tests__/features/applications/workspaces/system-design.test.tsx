/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}))
import { WorkspaceShell } from '@/features/applications/stages/components/workspace-shell'
import { SystemDesignWorkspace } from '@/features/applications/stages/workspaces/SystemDesignWorkspace'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'system-design', technicalRoundType: 'mixed',
  createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
  stages: {}, systemTours: [],
} as unknown as ApplicationDetail

beforeEach(() => globalThis.localStorage.clear())

describe('SystemDesignWorkspace', () => {
  it('renders its summary groups inside the shell without crashing', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <WorkspaceShell detail={detail} activeStage="system-design">
          <SystemDesignWorkspace detail={detail} />
        </WorkspaceShell>
      </QueryClientProvider>,
    )
    // Schedule & format now lives in the dashboard glance (shared draft via
    // StageDraftProvider), not the workspace.
    expect(screen.queryByText('Schedule & format')).toBeNull()
    expect(screen.getByText('Your own system design work')).toBeTruthy()
    expect(screen.getByText('Framework to have ready')).toBeTruthy()
  })
})
