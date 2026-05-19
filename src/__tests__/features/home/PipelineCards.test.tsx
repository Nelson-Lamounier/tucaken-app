/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('CardLayer', () => {
  it('renders the three glass status cards', async () => {
    vi.resetModules()
    const { CardLayer } = await import('@/features/home/lib/PipelineCards')
    render(<CardLayer reduce={false} />)
    expect(screen.getByText('Lead Discovered')).toBeTruthy()
    expect(screen.getByText('Call Initiated')).toBeTruthy()
    expect(screen.getByText('Resume Grounded')).toBeTruthy()
  })

  it('renders without crashing under reduced motion', async () => {
    vi.resetModules()
    const { CardLayer } = await import('@/features/home/lib/PipelineCards')
    const { container } = render(<CardLayer reduce />)
    expect(container.querySelectorAll('[data-card="float"]').length).toBe(3)
  })
})
