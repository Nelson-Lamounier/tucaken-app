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
import { TechnicalWorkspace } from '@/features/applications/stages/workspaces/TechnicalWorkspace'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'technical', technicalRoundType: 'mixed',
  createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
  stages: {}, research: undefined, dsaRealWork: [], devopsEvidence: [],
} as unknown as ApplicationDetail

beforeEach(() => globalThis.localStorage.clear())

describe('TechnicalWorkspace', () => {
  it('renders its summary groups inside the shell without crashing', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <WorkspaceShell detail={detail} activeStage="technical">
          <TechnicalWorkspace detail={detail} />
        </WorkspaceShell>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Schedule & format')).toBeTruthy()
    expect(screen.getByText('Your project reference sheet')).toBeTruthy()
  })
})
