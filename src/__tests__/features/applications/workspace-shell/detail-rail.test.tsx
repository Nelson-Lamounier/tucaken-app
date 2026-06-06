/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetailRailProvider, useDetailRail } from '@/features/applications/stages/components/workspace-shell/selection'
import { DetailRailDrawer } from '@/features/applications/stages/components/workspace-shell/DetailRail'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'technical', createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
} as unknown as ApplicationDetail

function Selector() {
  const { select } = useDetailRail()
  return <button type="button" onClick={() => select({ id: 'x', label: 'Caching', node: <p>Caching body</p> })}>pick</button>
}

function renderRail(extra?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DetailRailProvider initialFocus={undefined}>
        {extra}
        <DetailRailDrawer detail={detail} />
      </DetailRailProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => globalThis.localStorage.clear())

describe('DetailRailDrawer', () => {
  it('stays closed when nothing is selected', () => {
    renderRail()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/Select an item/i)).toBeNull()
  })

  it('opens with the selected detail and switches tabs', async () => {
    const user = userEvent.setup()
    renderRail(<Selector />)
    await user.click(screen.getByText('pick'))
    expect(await screen.findByText('Caching body')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(await screen.findByText('Application created')).toBeTruthy()
  })
})
