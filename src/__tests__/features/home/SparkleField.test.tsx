/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SparkleField } from '@/features/home/lib/SparkleField'

describe('SparkleField', () => {
  it('renders the requested number of sparkles', () => {
    const { container } = render(<SparkleField count={5} />)
    expect(container.querySelectorAll('span').length).toBe(5)
  })

  it('is decorative and non-interactive', () => {
    const { container } = render(<SparkleField count={3} />)
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.className).toContain('pointer-events-none')
  })
})
