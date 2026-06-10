/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell } from '@/features/applications/stages/components/workspace-shell'
import { BehaviouralWorkspace } from '@/features/applications/stages/workspaces/BehaviouralWorkspace'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'behavioural',
  createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
  stages: {},
} as unknown as ApplicationDetail

beforeEach(() => globalThis.localStorage.clear())

describe('BehaviouralWorkspace', () => {
  it('renders its summary groups inside the shell without crashing', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <WorkspaceShell detail={detail} activeStage="behavioural">
          <BehaviouralWorkspace detail={detail} />
        </WorkspaceShell>
      </QueryClientProvider>,
    )
    // Schedule & format now lives in the dashboard glance (shared draft via
    // StageDraftProvider), not the workspace.
    expect(screen.queryByText('Schedule & format')).toBeNull()
    expect(screen.getByText('Your story bank')).toBeTruthy()
  })
})
