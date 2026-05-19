/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ConveyorBelt } from '@/features/home/lib/ConveyorBelt'

describe('ConveyorBelt', () => {
  it('renders two identical item groups for a seamless loop', () => {
    const { container } = render(<ConveyorBelt />)
    const groups = container.querySelectorAll('[data-belt="group"]')
    expect(groups.length).toBe(2)
    const first = groups[0].querySelectorAll('[data-belt="item"]')
    const second = groups[1].querySelectorAll('[data-belt="item"]')
    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBe(second.length)
  })

  it('renders three processing stations', () => {
    const { container } = render(<ConveyorBelt />)
    expect(container.querySelectorAll('[data-belt="station"]').length).toBe(3)
  })

  it('applies belt-scroll animation class to the track', () => {
    const { container } = render(<ConveyorBelt />)
    expect(container.querySelector('.belt-scroll-anim')).toBeTruthy()
  })

  it('is decorative (aria-hidden) and has no interactive handlers', () => {
    const { container } = render(<ConveyorBelt />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
  })
})
