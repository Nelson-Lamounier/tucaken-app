/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationRowActions } from '@/features/applications/components/ApplicationRowActions'
import type { TailoredResumeSummary } from '@/server/applications'

const base: TailoredResumeSummary = {
  slug: 'a', targetCompany: 'Acme', targetRole: 'SWE', updatedAt: '2026-01-01',
  data: {} as never, coverLetter: null,
}

describe('ApplicationRowActions', () => {
  it('shows resume buttons but no cover-letter buttons when coverLetter is null', () => {
    render(<ApplicationRowActions tailored={base} onPreviewResume={vi.fn()} onPreviewCoverLetter={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByLabelText('Preview resume')).toBeTruthy()
    expect(screen.getByLabelText('Edit resume')).toBeTruthy()
    expect(screen.queryByLabelText('Preview cover letter')).toBeNull()
    expect(screen.queryByLabelText('Edit cover letter')).toBeNull()
  })

  it('shows cover-letter buttons when coverLetter is present', () => {
    const tr = { ...base, coverLetter: { greeting: 'Hi', paragraphs: [], signoff: { name: '', email: '', linkedin: '', github: '' } } }
    render(<ApplicationRowActions tailored={tr} onPreviewResume={vi.fn()} onPreviewCoverLetter={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByLabelText('Preview cover letter')).toBeTruthy()
    expect(screen.getByLabelText('Edit cover letter')).toBeTruthy()
  })
})
