/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ConsentBanner } from '@/features/consent/components/ConsentBanner'

describe('ConsentBanner legal links', () => {
  it('links to both the privacy policy and the cookie policy', () => {
    const { container } = render(<ConsentBanner onManage={() => {}} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/cookies')
  })
})
