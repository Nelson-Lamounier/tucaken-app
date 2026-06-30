/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectIntentModal } from '@/features/github/components/ProjectIntentModal'

describe('ProjectIntentModal', () => {
  const projects = [{ id: 'p1', name: 'Platform' }]
  it('offers build / link / kb-only', () => {
    render(<ProjectIntentModal open projects={projects} onChoose={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/Build a new Project/i)).toBeTruthy()
    expect(screen.getByText(/Link to an existing Project/i)).toBeTruthy()
    expect(screen.getByText(/knowledge base only/i)).toBeTruthy()
  })
  it('build -> onChoose intent=build', () => {
    const onChoose = vi.fn()
    render(<ProjectIntentModal open projects={projects} onChoose={onChoose} onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Build a new Project/i))
    expect(onChoose).toHaveBeenCalledWith({ intent: 'build' })
  })
  it('link -> requires a selected project, then onChoose intent=link+target', () => {
    const onChoose = vi.fn()
    render(<ProjectIntentModal open projects={projects} onChoose={onChoose} onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Link to an existing Project/i))
    fireEvent.change(screen.getByLabelText(/existing project/i), { target: { value: 'p1' } })
    fireEvent.click(screen.getByText(/^Link repository$/i))
    expect(onChoose).toHaveBeenCalledWith({ intent: 'link', targetProjectId: 'p1' })
  })
})
