import { describe, it, expect } from 'vitest'
import { buildCsp } from '../../server/security-header-values'

describe('buildCsp — GA4 allow-list', () => {
  it('permits googletagmanager in script-src (strict nonce variant)', () => {
    const csp = buildCsp('test-nonce')
    expect(csp).toContain("'nonce-test-nonce'")
    expect(csp).toContain('https://www.googletagmanager.com')
  })

  it('permits Google Analytics collection hosts in connect-src', () => {
    const csp = buildCsp()
    expect(csp).toContain('https://*.google-analytics.com')
    expect(csp).toContain('https://*.analytics.google.com')
    expect(csp).toContain('https://www.googletagmanager.com')
  })

  it('keeps existing Stripe + self directives intact', () => {
    const csp = buildCsp()
    expect(csp).toContain('https://js.stripe.com')
    expect(csp).toContain("default-src 'self'")
  })
})
