/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { toUserError } from '@/lib/errors/user-error'

describe('toUserError — standardized, server-detail-free messages', () => {
  it('never leaks the raw error message', () => {
    const m = toUserError(new Error('fetch failed'), 'analysis')
    expect(m.title).toBe("Couldn't start the analysis")
    expect(m.message).not.toMatch(/fetch failed/i)
    expect(JSON.stringify(m)).not.toMatch(/fetch failed/i)
  })

  it('does not leak status codes / URLs / stack-like detail', () => {
    const leaky = new Error('500 Internal Server Error at https://api.internal/v1/x\n  at handler (foo.ts:1:1)')
    const m = toUserError(leaky, 'coach')
    const blob = `${m.title} ${m.message}`
    expect(blob).not.toMatch(/500|http|\.ts:|at handler/i)
  })

  it('gives each context its own standard copy and an error tone', () => {
    expect(toUserError(null, 'analysis').title).toBe("Couldn't start the analysis")
    expect(toUserError(null, 'delete').title).toBe("Couldn't delete that")
    expect(toUserError(null, 'generic').title).toBe('Something went wrong')
    expect(toUserError(null, 'coach').tone).toBe('error')
  })

  it('surfaces an offline hint (user-side, not server detail) when offline', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const m = toUserError(new Error('whatever'), 'analysis')
    expect(m.message).toMatch(/offline/i)
    spy.mockRestore()
  })
})
