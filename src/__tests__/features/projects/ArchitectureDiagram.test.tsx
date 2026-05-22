/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}))

const renderMock = vi.fn()
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render:     (...args: unknown[]) => renderMock(...args),
  },
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (raw: string) => raw },
}))

import { ArchitectureDiagram } from '@/features/projects/components/ArchitectureDiagram'

describe('ArchitectureDiagram', () => {
  beforeEach(() => {
    renderMock.mockReset().mockResolvedValue({ svg: '<svg id="diagram"><rect /></svg>' })
  })

  it('renders the mermaid-produced SVG after hydration', async () => {
    const { container } = render(<ArchitectureDiagram format="mermaid" source="graph LR; A-->B" />)
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy())
    expect(renderMock).toHaveBeenCalled()
  })

  it('toggles to raw source view', async () => {
    render(<ArchitectureDiagram format="mermaid" source="graph LR; A-->B" />)
    await waitFor(() => screen.getByRole('button', { name: /view source/i }))
    await userEvent.click(screen.getByRole('button', { name: /view source/i }))
    expect(screen.getByText(/graph LR; A-->B/)).toBeTruthy()
  })

  it('injects svg-format source directly without calling mermaid', async () => {
    const { container } = render(
      <ArchitectureDiagram format="svg" source='<svg id="stored"><circle /></svg>' />,
    )
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy())
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('shows an error when mermaid rendering fails', async () => {
    renderMock.mockRejectedValueOnce(new Error('bad syntax'))
    render(<ArchitectureDiagram format="mermaid" source="not valid" />)
    await waitFor(() => screen.getByText('bad syntax'))
  })
})
