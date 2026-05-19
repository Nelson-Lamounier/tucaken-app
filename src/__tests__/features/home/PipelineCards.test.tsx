/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardLayer } from '@/features/home/lib/PipelineCards'

describe('CardLayer', () => {
  it('renders the three status cards', () => {
    render(<CardLayer reduce={false} />)
    expect(screen.getByText('Lead Qualified')).toBeTruthy()
    expect(screen.getByText('Call Initiated')).toBeTruthy()
    expect(screen.getByText('Resume Grounded')).toBeTruthy()
  })

  it('drops float animation class when reduce=true', () => {
    const { container } = render(<CardLayer reduce />)
    expect(container.querySelector('.card-float-anim')).toBeNull()
  })
})
