/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineText } from '@/features/projects/components/detail/InlineText'

describe('InlineText', () => {
  it('renders the value as a button when not editing', () => {
    render(<InlineText value="Hello" ariaLabel="title" onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /edit title/i })).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('renders placeholder when value is null', () => {
    render(<InlineText value={null} placeholder="(empty)" ariaLabel="x" onSave={vi.fn()} />)
    expect(screen.getByText('(empty)')).toBeTruthy()
  })

  it('commits on Enter (single line) and calls onSave with trimmed value', async () => {
    const onSave = vi.fn()
    render(<InlineText value="Old" ariaLabel="title" onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: /edit title/i }))
    const input = screen.getByLabelText('title') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '  New value  ')
    await userEvent.keyboard('{Enter}')
    expect(onSave).toHaveBeenCalledWith('New value')
  })

  it('cancels on Escape without calling onSave', async () => {
    const onSave = vi.fn()
    render(<InlineText value="Old" ariaLabel="title" onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: /edit title/i }))
    const input = screen.getByLabelText('title') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'discarded')
    await userEvent.keyboard('{Escape}')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves an empty value as null so callers can clear fields', async () => {
    const onSave = vi.fn()
    render(<InlineText value="Old" ariaLabel="title" onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: /edit title/i }))
    const input = screen.getByLabelText('title') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.keyboard('{Enter}')
    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('does not call onSave when the value is unchanged', async () => {
    const onSave = vi.fn()
    render(<InlineText value="Same" ariaLabel="title" onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: /edit title/i }))
    await userEvent.keyboard('{Enter}')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('disabled mode does not open the editor on click', async () => {
    const onSave = vi.fn()
    render(<InlineText value="Locked" ariaLabel="title" disabled onSave={onSave} />)
    await userEvent.click(screen.getByText('Locked'))
    expect(screen.queryByLabelText('title')).toBeNull()
  })
})
