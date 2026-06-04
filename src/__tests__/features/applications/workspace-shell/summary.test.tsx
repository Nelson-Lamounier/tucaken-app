/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailRailProvider, useDetailRail } from '@/features/applications/stages/components/workspace-shell/selection'
import { SummaryGroup } from '@/features/applications/stages/components/workspace-shell/SummaryGroup'
import { SummaryRow } from '@/features/applications/stages/components/workspace-shell/SummaryRow'

function Probe() {
  const { selected, tab } = useDetailRail()
  return <output data-testid="probe">{tab}:{selected?.id ?? 'none'}</output>
}

function Fixture() {
  return (
    <DetailRailProvider initialFocus={undefined}>
      <SummaryGroup id="topics" title="Topics likely to come up" count={2}>
        <SummaryRow id="caching" label="Caching" detail={<p>Caching full text</p>} />
        <SummaryRow id="sharding" label="Sharding" detail={<p>Sharding full text</p>} />
      </SummaryGroup>
      <Probe />
    </DetailRailProvider>
  )
}

describe('SummaryGroup / SummaryRow', () => {
  it('renders the group title, count and rows', () => {
    render(<Fixture />)
    expect(screen.getByText('Topics likely to come up')).toBeTruthy()
    expect(screen.getByText('Caching')).toBeTruthy()
    expect(screen.getByText('Sharding')).toBeTruthy()
  })

  it('clicking a row selects it in the rail context', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    await user.click(screen.getByRole('button', { name: /Caching/ }))
    expect(screen.getByTestId('probe').textContent).toBe('detail:caching')
  })

  it('collapsing a group hides its rows', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    await user.click(screen.getByRole('button', { name: /Topics likely to come up/ }))
    await waitFor(() => expect(screen.queryByText('Caching')).toBeNull())
  })
})
