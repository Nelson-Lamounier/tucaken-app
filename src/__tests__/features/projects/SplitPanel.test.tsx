/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import { SplitPanel } from '@/features/projects/components/editor/SplitPanel'
import type { ProjectComponent } from '@/features/projects/lib/types'

function comp(id: string, name: string): ProjectComponent {
  return { id, name, kind: 'backend', order_index: 0 }
}

function renderPanel(props: Partial<React.ComponentProps<typeof SplitPanel>> = {}) {
  const onSplit = vi.fn()
  const onUnstage = vi.fn()
  render(
    <DndContext>
      <SplitPanel
        stagedComponents={props.stagedComponents ?? [comp('c1', 'API')]}
        totalComponents={props.totalComponents ?? 3}
        isPending={props.isPending ?? false}
        error={props.error ?? null}
        onUnstage={onUnstage}
        onSplit={onSplit}
      />
    </DndContext>,
  )
  return { onSplit, onUnstage }
}

describe('SplitPanel', () => {
  it('shows the drop hint when nothing is staged', () => {
    renderPanel({ stagedComponents: [] })
    expect(screen.getByText(/drag components here/i)).toBeTruthy()
  })

  it('auto-derives the slug from the name', async () => {
    renderPanel()
    await userEvent.type(screen.getByPlaceholderText(/billing service/i), 'Billing Service')
    const slug = screen.getByPlaceholderText('billing-service') as HTMLInputElement
    expect(slug.value).toBe('billing-service')
  })

  it('calls onSplit with name and slug', async () => {
    const { onSplit } = renderPanel()
    await userEvent.type(screen.getByPlaceholderText(/billing service/i), 'Atlas')
    await userEvent.click(screen.getByRole('button', { name: /split 1 component/i }))
    expect(onSplit).toHaveBeenCalledWith({ name: 'Atlas', slug: 'atlas' })
  })

  it('blocks splitting every component (would empty source)', async () => {
    const { onSplit } = renderPanel({
      stagedComponents: [comp('c1', 'A'), comp('c2', 'B')],
      totalComponents:  2,
    })
    await userEvent.type(screen.getByPlaceholderText(/billing service/i), 'Atlas')
    expect(screen.getByText(/keep at least one component/i)).toBeTruthy()
    const btn = screen.getByRole('button', { name: /split 2 components/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(onSplit).not.toHaveBeenCalled()
  })

  it('unstages a component when its remove button is clicked', async () => {
    const { onUnstage } = renderPanel({ stagedComponents: [comp('c1', 'API')] })
    await userEvent.click(screen.getByRole('button', { name: /remove api from split/i }))
    expect(onUnstage).toHaveBeenCalledWith('c1')
  })
})
