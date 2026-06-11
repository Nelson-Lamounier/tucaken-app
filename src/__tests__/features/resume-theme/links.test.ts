import { describe, it, expect } from 'vitest'
import { emailHref, telHref, urlHref } from '@/features/resume-theme/app/links'

describe('emailHref', () => {
  it('prefixes a bare address with mailto:', () => {
    expect(emailHref('alex@mail.com')).toBe('mailto:alex@mail.com')
  })
  it('is idempotent when already prefixed', () => {
    expect(emailHref('mailto:alex@mail.com')).toBe('mailto:alex@mail.com')
  })
})

describe('telHref', () => {
  it('strips formatting to digits and +', () => {
    expect(telHref('(555) 123-4567')).toBe('tel:5551234567')
    expect(telHref('+1 555 123 4567')).toBe('tel:+15551234567')
  })
})

describe('urlHref', () => {
  it('prepends https:// to a bare domain', () => {
    expect(urlHref('linkedin.com/in/alexchen')).toBe('https://linkedin.com/in/alexchen')
  })
  it('leaves an existing http(s) scheme untouched', () => {
    expect(urlHref('http://example.com')).toBe('http://example.com')
    expect(urlHref('https://github.com/x')).toBe('https://github.com/x')
  })
  it('normalizes protocol-relative and leading-slash forms', () => {
    expect(urlHref('//cdn.example.com')).toBe('https://cdn.example.com')
    expect(urlHref('/github.com/x')).toBe('https://github.com/x')
  })
})
