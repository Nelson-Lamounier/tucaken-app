/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { FunnelView } from '@/features/search-analytics/FunnelView'
import type { FunnelTransition } from '@/lib/types/applications.types'

// A mix of above / typical / below bands, each with a distinct honest context.
const TRANSITIONS: readonly FunnelTransition[] = [
  {
    key: 'applied->screen',
    fromCount: 40,
    toCount: 12,
    rate: 0.3,
    band: 'above',
    context: 'Above the typical 15–25% application-to-screen range for 2026.',
  },
  {
    key: 'screen->onsite',
    fromCount: 12,
    toCount: 6,
    rate: 0.5,
    band: 'typical',
    context: 'Within the typical 40–60% screen-to-onsite range.',
  },
  {
    key: 'onsite->offer',
    fromCount: 6,
    toCount: 1,
    rate: 0.17,
    band: 'below',
    context: 'Below the typical 25–40% onsite-to-offer range — worth reviewing.',
  },
]

describe('FunnelView — honest framing', () => {
  it('renders every transition with its context qualifier present in the DOM', () => {
    render(<FunnelView transitions={TRANSITIONS} />)
    for (const t of TRANSITIONS) {
      expect(screen.getByText(t.context)).toBeTruthy()
    }
  })

  it('renders the rate as a percentage for every transition', () => {
    const { container } = render(<FunnelView transitions={TRANSITIONS} />)
    const rates = container.querySelectorAll('[data-funnel-rate]')
    expect(rates.length).toBe(TRANSITIONS.length)
    for (const rate of rates) {
      expect(rate.textContent).toMatch(/%$/)
    }
  })

  it('never renders a bare rate: every rate node is paired with a context node in the same transition', () => {
    const { container } = render(<FunnelView transitions={TRANSITIONS} />)
    const rows = container.querySelectorAll('[data-funnel-transition]')
    expect(rows.length).toBe(TRANSITIONS.length)

    let rateCount = 0
    let contextCount = 0
    for (const row of rows) {
      const rate = row.querySelector('[data-funnel-rate]')
      const context = row.querySelector('[data-funnel-context]')
      // Each transition row must carry BOTH a rate and its context.
      expect(rate).not.toBeNull()
      expect(context).not.toBeNull()
      expect(rate?.textContent).toMatch(/%$/)
      expect((context?.textContent ?? '').trim().length).toBeGreaterThan(0)
      rateCount += 1
      contextCount += 1
    }
    // Context strings rendered must be >= rate %s rendered.
    expect(contextCount).toBeGreaterThanOrEqual(rateCount)
  })

  it('renders no success-score, velocity, or cohort-ranking language', () => {
    const { container } = render(<FunnelView transitions={TRANSITIONS} />)
    expect(container.textContent ?? '').not.toMatch(
      /success score|career score|apply to more|compared to other users|rank/i,
    )
  })
})
