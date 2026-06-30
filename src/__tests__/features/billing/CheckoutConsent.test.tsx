/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CheckoutConsent } from '@/features/billing/components/CheckoutConsent'

describe('CheckoutConsent', () => {
  it('links to the terms page and reports ticking', () => {
    const onChange = vi.fn()
    render(<CheckoutConsent accepted={false} onChange={onChange} />)
    const terms = screen.getByRole('link', { name: 'Terms & Conditions' })
    expect(terms.getAttribute('href')).toBe('/terms')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('mentions non-refundable and the immediate-performance waiver', () => {
    render(<CheckoutConsent accepted={false} onChange={() => {}} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('non-refundable')
    expect(text).toContain('begin immediately')
  })
})
