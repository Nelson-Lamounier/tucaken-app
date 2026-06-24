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

  it('normalises the source before calling mermaid.render', async () => {
    render(<ArchitectureDiagram format="mermaid" source="graph LR\n A[x\\ny]" />)
    await waitFor(() => expect(renderMock).toHaveBeenCalled())
    const calledSource: string = renderMock.mock.calls[0][1] as string
    expect(calledSource).toMatch(/<br\/>/)
    expect(calledSource).not.toMatch(/\\n/)
  })

  it('falls back to the node/edge list when mermaid.render throws', async () => {
    renderMock.mockRejectedValueOnce(new Error('Lexical error on line 8'))
    render(
      <ArchitectureDiagram
        format="mermaid"
        source="graph LR\n A[bad\nlabel]"
        nodes={[{ id: 'a', label: 'AdminAPI', kind: 'service' }]}
        edges={[{ from: 'a', to: 'b' }]}
      />,
    )
    await waitFor(() => screen.getByText('AdminAPI'))
    expect(screen.queryByText(/Lexical error/)).toBeNull()
  })
})
