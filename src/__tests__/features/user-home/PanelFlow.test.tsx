/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PanelFlow } from '@/features/user-home/components/PanelFlow'

describe('PanelFlow', () => {
  it('defaults --panel-min to 320px and applies the panel-flow class', () => {
    const { container } = render(
      <PanelFlow>
        <div>child a</div>
      </PanelFlow>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('panel-flow')
    expect(el.style.getPropertyValue('--panel-min')).toBe('320px')
    expect(container.textContent).toContain('child a')
  })

  it('applies a custom min, extra className, and renders all children', () => {
    const { container } = render(
      <PanelFlow min={340} className="mt-4">
        <div>child a</div>
        <span>child b</span>
      </PanelFlow>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue('--panel-min')).toBe('340px')
    expect(el.className).toContain('panel-flow')
    expect(el.className).toContain('mt-4')
    expect(container.textContent).toContain('child a')
    expect(container.textContent).toContain('child b')
  })
})
