/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BgLayer, CoreLayer } from '@/features/home/lib/pipeline-svg'

describe('pipeline-svg', () => {
  it('BgLayer renders a grid svg', () => {
    const { container } = render(<BgLayer reduce={false} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('[data-pipeline="grid"]')).toBeTruthy()
  })

  it('CoreLayer renders cables and nodes', () => {
    const { container } = render(<CoreLayer reduce={false} />)
    expect(container.querySelectorAll('[data-pipeline="cable"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-pipeline="node"]').length).toBeGreaterThan(0)
  })

  it('CoreLayer drops pulse and glow animation classes when reduce=true', () => {
    const { container } = render(<CoreLayer reduce />)
    expect(container.querySelector('.pipe-pulse-anim')).toBeNull()
    expect(container.querySelector('.node-glow-anim')).toBeNull()
  })
})
