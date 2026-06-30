import { describe, it, expect } from 'vitest'
import { planLimitMessage } from '@/features/github/lib/plan-limit-error'

describe('planLimitMessage', () => {
  it('extracts the detail from a 403 repo-limit error', () => {
    const err = new Error('admin-api POST /github/connected-repos failed [403] — Your plan allows 1 repository. Upgrade for more.')
    expect(planLimitMessage(err)).toBe('Your plan allows 1 repository. Upgrade for more.')
  })

  it('extracts the detail from a 429 monthly-quota error', () => {
    const err = new Error("admin-api POST /github/connected-repos failed [429] — You've used all 3 syncs this month. Upgrade for more.")
    expect(planLimitMessage(err)).toBe("You've used all 3 syncs this month. Upgrade for more.")
  })

  it('returns null for a non-limit status', () => {
    expect(planLimitMessage(new Error('admin-api GET /x failed [500] — Internal error'))).toBeNull()
  })

  it('returns null for a bare 403 without limit wording (generic forbidden)', () => {
    expect(planLimitMessage(new Error('admin-api POST /x failed [403] — Forbidden'))).toBeNull()
  })

  it('returns null for a network/other error', () => {
    expect(planLimitMessage(new Error('Failed to fetch'))).toBeNull()
  })

  it('falls back to a generic message when a limit status has no detail', () => {
    expect(planLimitMessage(new Error('request failed [429] — limit'))).toBe('limit')
    expect(planLimitMessage(new Error('plan allows nothing [403]'))).toBe('You have reached your plan limit.')
  })
})
