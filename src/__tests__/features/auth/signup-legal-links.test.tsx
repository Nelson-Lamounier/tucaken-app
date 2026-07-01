/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SignUpForm } from '@/features/auth/components/SignUpForm'

describe('SignUpForm legal links', () => {
  it('links acceptance copy to the terms and privacy pages', () => {
    render(
      <SignUpForm
        onSwitchToSignIn={() => {}}
        onGoogle={() => {}}
        onGithub={() => {}}
      />,
    )
    const terms = screen.getByRole('link', { name: 'Terms & Conditions' })
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(terms.getAttribute('href')).toBe('/terms')
    expect(privacy.getAttribute('href')).toBe('/privacy')
  })
})
