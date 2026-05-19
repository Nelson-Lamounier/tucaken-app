/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineStage } from '@/features/home/lib/PipelineStage'

describe('PipelineStage', () => {
  it('renders all four layers and the copy children', () => {
    const { container } = render(
      <PipelineStage>
        <p>copy-slot</p>
      </PipelineStage>,
    )
    expect(container.querySelector('[data-layer="bg"]')).toBeTruthy()
    expect(container.querySelector('[data-layer="core"]')).toBeTruthy()
    expect(container.querySelector('[data-layer="cards"]')).toBeTruthy()
    expect(container.querySelector('[data-layer="copy"]')).toBeTruthy()
    expect(screen.getByText('copy-slot')).toBeTruthy()
  })

  it('copy layer is interactive, depth layers are not', () => {
    const { container } = render(<PipelineStage><span>x</span></PipelineStage>)
    expect(container.querySelector('[data-layer="copy"]')?.className).toContain('pointer-events-auto')
    expect(container.querySelector('[data-layer="bg"]')?.className).toContain('pointer-events-none')
  })
})
