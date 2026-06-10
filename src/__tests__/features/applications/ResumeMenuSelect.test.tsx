/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AdminResume } from '@/features/applications/hooks/use-resume-versions'
import { ResumeMenuSelect } from '@/features/applications/components/ResumeMenuSelect'

// Router Link -> plain anchor
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

const useResumeVersionsMock = vi.fn()
vi.mock('@/features/applications/hooks/use-resume-versions', () => ({
  useResumeVersions: () => useResumeVersionsMock(),
}))

function makeResume(over: Partial<AdminResume>): AdminResume {
  return {
    resumeId: 'r1',
    label: 'Resume 1',
    isActive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('ResumeMenuSelect', () => {
  beforeEach(() => {
    useResumeVersionsMock.mockReset()
  })

  it('resolves the active resume as the default when resumeId is null', () => {
    const resumes = [
      makeResume({ resumeId: 'old', label: 'Old', updatedAt: '2026-02-01T00:00:00.000Z' }),
      makeResume({ resumeId: 'active', label: 'Active One', isActive: true, updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]
    useResumeVersionsMock.mockReturnValue({ data: resumes, isLoading: false })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId={null} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith('active')
  })

  it('defaults to most-recent when no resume is active', () => {
    const resumes = [
      makeResume({ resumeId: 'older', updatedAt: '2026-01-01T00:00:00.000Z' }),
      makeResume({ resumeId: 'newer', updatedAt: '2026-03-01T00:00:00.000Z' }),
    ]
    useResumeVersionsMock.mockReturnValue({ data: resumes, isLoading: false })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId={null} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith('newer')
  })

  it('defaults to build-from-scratch ("") when there are no resumes', () => {
    useResumeVersionsMock.mockReturnValue({ data: [], isLoading: false })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId={null} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not re-resolve the default once resumeId is set', () => {
    useResumeVersionsMock.mockReturnValue({
      data: [makeResume({ resumeId: 'active', isActive: true })],
      isLoading: false,
    })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId="" onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lets the user pick build-from-scratch from the menu', () => {
    useResumeVersionsMock.mockReturnValue({
      data: [makeResume({ resumeId: 'active', label: 'Active One', isActive: true })],
      isLoading: false,
    })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId="active" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Build from scratch with agent'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('renders a skeleton and does not resolve a default while loading', () => {
    useResumeVersionsMock.mockReturnValue({ data: undefined, isLoading: true })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId={null} onChange={onChange} />)
    expect(screen.getByLabelText('Loading resumes')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('informs the user when they have no resumes', () => {
    useResumeVersionsMock.mockReturnValue({ data: [], isLoading: false })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId="" onChange={onChange} />)
    expect(screen.getByText(/No resume yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/no resumes yet/i)).toBeTruthy()
  })
})
