/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PipelineScene } from '@/features/home/lib/PipelineScene'

describe('PipelineScene', () => {
  it('renders the three depth layers', () => {
    const { container } = render(<PipelineScene />)
    expect(container.querySelector('[data-scene="bg"]')).toBeTruthy()
    expect(container.querySelector('[data-scene="core"]')).toBeTruthy()
    expect(container.querySelector('[data-scene="cards"]')).toBeTruthy()
  })

  it('has a static preserve-3d stage with no rotation transform', () => {
    const { container } = render(<PipelineScene />)
    const stage = container.querySelector('[data-scene="stage"]') as HTMLElement
    expect(stage).toBeTruthy()
    expect(stage.style.transformStyle).toBe('preserve-3d')
    expect(stage.style.transform || '').not.toMatch(/rotate/i)
  })
})
