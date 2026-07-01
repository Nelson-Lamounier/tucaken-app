/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { LEGAL } from '@/features/legal/config'
import type { LegalDoc } from '@/features/legal/types'

const doc: LegalDoc = {
  slug: 'terms',
  title: 'Sample Doc',
  lastUpdated: '2026-06-30',
  sections: [
    { id: 'alpha', heading: 'Alpha', body: <p>alpha body</p> },
    { id: 'beta', heading: 'Beta', body: <p>beta body</p> },
  ],
}

describe('LegalPage', () => {
  it('renders title, last-updated, contact email and section anchors', () => {
    const { container } = render(<LegalPage doc={doc} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sample Doc' })).toBeTruthy()
    expect(container.textContent).toContain('2026-06-30')
    expect(container.textContent).toContain(LEGAL.contactEmail)
    expect(container.querySelector('#alpha')).toBeTruthy()
    expect(container.querySelector('#beta')).toBeTruthy()
  })

  it('shows cross-links to the other two documents but not the current one', () => {
    const { container } = render(<LegalPage doc={doc} />)
    const hrefs = Array.from(container.querySelectorAll('footer a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/cookies')
    expect(hrefs).not.toContain('/terms')
  })
})
