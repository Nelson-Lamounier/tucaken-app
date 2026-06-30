/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PanelStack } from '@/features/user-home/components/PanelStack'
import { PanelGrid } from '@/features/user-home/components/PanelGrid'
import { SplitLayout } from '@/features/user-home/components/SplitLayout'

describe('PanelStack', () => {
  it('stacks its children in a flex column and renders them all', () => {
    const { container } = render(
      <PanelStack>
        <div>one</div>
        <div>two</div>
      </PanelStack>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('flex')
    expect(el.className).toContain('flex-col')
    expect(container.textContent).toContain('one')
    expect(container.textContent).toContain('two')
  })

  it('appends an extra className', () => {
    const { container } = render(<PanelStack className="mt-4"><div>x</div></PanelStack>)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('flex-col')
    expect(el.className).toContain('mt-4')
  })
})

describe('PanelGrid', () => {
  it('defaults --panel-min to 300px and applies the panel-grid class', () => {
    const { container } = render(<PanelGrid><div>card</div></PanelGrid>)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('panel-grid')
    expect(el.style.getPropertyValue('--panel-min')).toBe('300px')
    expect(container.textContent).toContain('card')
  })

  it('applies a custom min and extra className', () => {
    const { container } = render(
      <PanelGrid min={320} className="mb-2">
        <div>a</div>
        <div>b</div>
      </PanelGrid>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue('--panel-min')).toBe('320px')
    expect(el.className).toContain('panel-grid')
    expect(el.className).toContain('mb-2')
    expect(container.textContent).toContain('a')
    expect(container.textContent).toContain('b')
  })
})

describe('SplitLayout', () => {
  it('renders main and aside and defaults --aside-w to 340px', () => {
    const { container } = render(
      <SplitLayout main={<div>main content</div>} aside={<div>rail content</div>} />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('split-layout')
    expect(el.style.getPropertyValue('--aside-w')).toBe('340px')
    expect(container.textContent).toContain('main content')
    expect(container.textContent).toContain('rail content')
  })

  it('applies a custom asideWidth', () => {
    const { container } = render(
      <SplitLayout main={<div>m</div>} aside={<div>a</div>} asideWidth={300} />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue('--aside-w')).toBe('300px')
  })
})
