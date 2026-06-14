/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YearsGapRow } from '@/features/applications/stages/components/YearsGapRow'
import type { YearsGap } from '@/lib/types/applications.types'

const BASE_GAP: YearsGap = {
  relevantYears: 5,
  requiredYears: 8,
  gapYears: 3,
  disqualifying: false,
  relevantRoleTitles: ['AWS'],
  framingLine: '5 years across operations and support',
}

describe('YearsGapRow', () => {
  it('renders relevant years', () => {
    render(<YearsGapRow yearsGap={BASE_GAP} />)
    expect(screen.getByText(/5 yrs relevant/)).toBeTruthy()
  })

  it('renders required years suffix when present', () => {
    render(<YearsGapRow yearsGap={BASE_GAP} />)
    expect(screen.getByText(/8\+ wanted/)).toBeTruthy()
  })

  it('renders the framing line', () => {
    render(<YearsGapRow yearsGap={BASE_GAP} />)
    expect(screen.getByText('5 years across operations and support')).toBeTruthy()
  })

  it('renders the gap badge when gapYears > 0', () => {
    render(<YearsGapRow yearsGap={BASE_GAP} />)
    expect(screen.getByText(/3 short/)).toBeTruthy()
  })

  it('omits the gap badge when gapYears is 0', () => {
    render(<YearsGapRow yearsGap={{ ...BASE_GAP, gapYears: 0 }} />)
    expect(screen.queryByText(/short/)).toBeNull()
  })

  it('omits wanted suffix when requiredYears is null', () => {
    render(<YearsGapRow yearsGap={{ ...BASE_GAP, requiredYears: null }} />)
    expect(screen.queryByText(/wanted/)).toBeNull()
  })
})
