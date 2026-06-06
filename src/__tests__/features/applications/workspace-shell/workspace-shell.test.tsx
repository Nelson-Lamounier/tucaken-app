/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell, SummaryGroup, SummaryRow } from '@/features/applications/stages/components/workspace-shell'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'technical', createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
} as unknown as ApplicationDetail

beforeEach(() => globalThis.localStorage.clear())

describe('WorkspaceShell', () => {
  it('renders summary children and opens the detail drawer on selection', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <WorkspaceShell detail={detail} activeStage="technical">
          <SummaryGroup id="topics" title="Topics" count={1}>
            <SummaryRow id="caching" label="Caching" detail={<p>Caching body</p>} />
          </SummaryGroup>
        </WorkspaceShell>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Topics')).toBeTruthy()
    // Drawer is closed until a row is selected — no detail content yet.
    expect(screen.queryByText('Caching body')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Caching/ }))
    expect(await screen.findByText('Caching body')).toBeTruthy()
  })
})
