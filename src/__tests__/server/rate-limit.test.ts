/**
 * @format
 * Unit tests for the in-memory auth rate limiter.
 *
 * Pure fixed-window logic — no TanStack/Cognito mocks needed. Time is
 * injected via the `now` argument so windows are deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { checkRateLimit, _resetRateLimits } from '@/server/_rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => _resetRateLimits())

  it('allows requests up to the limit within a window', () => {
    const r1 = checkRateLimit('signin:1.2.3.4', 3, 60_000, 1_000)
    const r2 = checkRateLimit('signin:1.2.3.4', 3, 60_000, 1_100)
    const r3 = checkRateLimit('signin:1.2.3.4', 3, 60_000, 1_200)
    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true])
    expect(r3.remaining).toBe(0)
  })

  it('blocks the request that exceeds the limit and reports Retry-After', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('signin:ip', 3, 60_000, 1_000)
    const blocked = checkRateLimit('signin:ip', 3, 60_000, 31_000)
    expect(blocked.allowed).toBe(false)
    // window started at 1_000, resets at 61_000; 31_000 → 30s remaining
    expect(blocked.retryAfterSeconds).toBe(30)
  })

  it('resets the window once it has elapsed', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('signin:ip', 3, 60_000, 1_000)
    expect(checkRateLimit('signin:ip', 3, 60_000, 1_500).allowed).toBe(false)
    // 61_000 ms is the reset boundary — counter starts fresh
    const afterReset = checkRateLimit('signin:ip', 3, 60_000, 61_000)
    expect(afterReset.allowed).toBe(true)
  })

  it('tracks keys independently', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('signin:a', 3, 60_000, 1_000)
    expect(checkRateLimit('signin:a', 3, 60_000, 1_000).allowed).toBe(false)
    expect(checkRateLimit('signin:b', 3, 60_000, 1_000).allowed).toBe(true)
  })

  it('rounds Retry-After up to whole seconds', () => {
    for (let i = 0; i < 1; i++) checkRateLimit('k', 1, 5_000, 0)
    // 200ms into a 5s window → 4.8s left → ceil → 5
    expect(checkRateLimit('k', 1, 5_000, 200).retryAfterSeconds).toBe(5)
  })
})
