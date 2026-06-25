/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationRowActions } from '@/features/applications/components/ApplicationRowActions'
import type { TailoredResumeSummary } from '@/server/applications'

const base: TailoredResumeSummary = {
  slug: 's', targetCompany: 'C', targetRole: 'R', updatedAt: '2026-01-01',
  data: {} as TailoredResumeSummary['data'], coverLetter: null,
}
const noop = () => {}
const props = {
  onPreviewResume: noop, onEditResume: noop,
  onPreviewCoverLetter: noop, onEditCoverLetter: noop,
}

describe('ApplicationRowActions', () => {
  it('renders nothing without a tailored resume', () => {
    const { container } = render(<ApplicationRowActions tailored={null} {...props} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders resume buttons but no cover-letter buttons when coverLetter is null', () => {
    render(<ApplicationRowActions tailored={base} {...props} />)
    expect(screen.getByLabelText('Preview resume')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit resume')).toBeInTheDocument()
    expect(screen.queryByLabelText('Preview cover letter')).toBeNull()
  })
  it('renders cover-letter buttons when present', () => {
    const withCl = { ...base, coverLetter: { greeting: 'H', paragraphs: ['p'], signoff: { name: 'N', email: '', linkedin: '', github: '' } } }
    render(<ApplicationRowActions tailored={withCl} {...props} />)
    expect(screen.getByLabelText('Preview cover letter')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit cover letter')).toBeInTheDocument()
  })
  it('fires onEditResume on click', () => {
    const onEditResume = vi.fn()
    render(<ApplicationRowActions tailored={base} {...{ ...props, onEditResume }} />)
    screen.getByLabelText('Edit resume').click()
    expect(onEditResume).toHaveBeenCalledOnce()
  })
})
