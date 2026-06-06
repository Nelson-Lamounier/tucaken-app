/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell } from '@/features/applications/stages/components/workspace-shell'
import { PhoneScreenWorkspace } from '@/features/applications/stages/workspaces/PhoneScreenWorkspace'
import { StageDraftProvider } from '@/features/applications/stages/hooks/stage-draft-context'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'phone-screen',
  createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
  stages: {}, research: undefined,
} as unknown as ApplicationDetail

beforeEach(() => globalThis.localStorage.clear())

describe('PhoneScreenWorkspace', () => {
  it('renders its summary groups inside the shell without crashing', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <StageDraftProvider slug={detail.slug} stage="phone-screen">
          <WorkspaceShell detail={detail} activeStage="phone-screen">
            <PhoneScreenWorkspace detail={detail} />
          </WorkspaceShell>
        </StageDraftProvider>
      </QueryClientProvider>,
    )
    // Schedule & format now lives in the dashboard SchedulePanel; the workspace
    // still renders its talking-points group.
    expect(screen.getByText('Your talking points')).toBeTruthy()
  })
})
