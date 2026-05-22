import { describe, expect, it } from 'vitest'
import { slugify } from '@/features/projects/lib/format'

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Billing Service')).toBe('billing-service')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify('My Cool Project!! (v2)')).toBe('my-cool-project-v2')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Hello--  ')).toBe('hello')
  })

  it('produces output matching the admin-api slug regex', () => {
    for (const input of ['Atlas', 'A B C', 'foo_bar.baz', '99 Bottles']) {
      const slug = slugify(input)
      expect(slug).toMatch(SLUG_REGEX)
    }
  })

  it('caps length at 80 characters with no trailing hyphen', () => {
    const slug = slugify('x'.repeat(200))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})
