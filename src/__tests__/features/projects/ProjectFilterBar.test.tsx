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
  it('renders the current filter selections + the search trigger', () => {
    render(
      <ProjectFilterBar value={{ type: 'open_source', status: 'all' }} onChange={vi.fn()} onSearchClick={vi.fn()} />,
    )
    // The dropdown triggers show the selected labels.
    expect(screen.getByText('Open source')).toBeTruthy()
    expect(screen.getByText('Any status')).toBeTruthy()
    // The standardised search trigger is present.
    expect(screen.getByRole('button', { name: /search projects/i })).toBeTruthy()
  })

  it('calls onSearchClick when the search trigger is clicked', async () => {
    const onSearchClick = vi.fn()
    render(<ProjectFilterBar value={DEFAULT} onChange={vi.fn()} onSearchClick={onSearchClick} />)
    await userEvent.click(screen.getByRole('button', { name: /search projects/i }))
    expect(onSearchClick).toHaveBeenCalledTimes(1)
  })

  it('emits onChange when a type is selected from the dropdown', async () => {
    const onChange = vi.fn()
    render(<ProjectFilterBar value={DEFAULT} onChange={onChange} onSearchClick={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /all types/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Open source' }))
    expect(onChange).toHaveBeenCalledWith({ type: 'open_source', status: 'all' })
  })
})
