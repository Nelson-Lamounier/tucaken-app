/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ProjectFilterBar,
  type ProjectFilterValue,
} from '@/features/projects/components/index/ProjectFilterBar'

const DEFAULT: ProjectFilterValue = { type: 'all', status: 'all' }

describe('ProjectFilterBar', () => {
  it('marks the active chip via aria-pressed', () => {
    render(<ProjectFilterBar value={{ type: 'open_source', status: 'all' }} onChange={vi.fn()} />)
    const active = screen.getByRole('button', { name: 'Open source' })
    expect(active.getAttribute('aria-pressed')).toBe('true')
  })

  it('emits onChange with the next type when a chip is clicked', async () => {
    const onChange = vi.fn()
    render(<ProjectFilterBar value={DEFAULT} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open source' }))
    expect(onChange).toHaveBeenCalledWith({ type: 'open_source', status: 'all' })
  })

  it('emits onChange preserving the type when a status chip is clicked', async () => {
    const onChange = vi.fn()
    render(<ProjectFilterBar value={{ type: 'side_project', status: 'all' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Active' }))
    expect(onChange).toHaveBeenCalledWith({ type: 'side_project', status: 'active' })
  })
})
