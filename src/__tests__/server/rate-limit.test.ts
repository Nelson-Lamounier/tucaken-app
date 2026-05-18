/**
 * @format
 * Unit tests for the in-memory auth rate limiter.
 *
 * Token-bucket semantics: `limit` is the bucket capacity, `windowMs` is the
 * time to refill a full bucket, so the refill rate is `limit / windowMs`
 * tokens per ms. Time is injected via `now` so refill is deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { checkRateLimit, _resetRateLimits } from '@/server/_rate-limit'

describe('checkRateLimit (token bucket)', () => {
  beforeEach(() => _resetRateLimits())

  it('allows a burst up to capacity', () => {
    const results = []
    for (let i = 0; i < 3; i++) {
      results.push(checkRateLimit('signin:ip', 3, 60_000, 1_000).allowed)
    }
    expect(results).toEqual([true, true, true])
  })

  it('rejects the request that drains the bucket', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('signin:ip', 3, 60_000, 1_000)
    const blocked = checkRateLimit('signin:ip', 3, 60_000, 1_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('refills gradually — one token becomes available after 1/rate ms', () => {
    // capacity 3 over 60s → 1 token per 20s.
    for (let i = 0; i < 3; i++) checkRateLimit('k', 3, 60_000, 0)
    // 10s later: only 0.5 tokens refilled → still blocked.
    expect(checkRateLimit('k', 3, 60_000, 10_000).allowed).toBe(false)
    // 20s after drain: exactly 1 token refilled → allowed once.
    expect(checkRateLimit('k', 3, 60_000, 20_000).allowed).toBe(true)
    expect(checkRateLimit('k', 3, 60_000, 20_000).allowed).toBe(false)
  })

  it('caps refill at capacity (no token hoarding while idle)', () => {
    checkRateLimit('k', 3, 60_000, 0) // 1 consumed, 2 left
    // Idle far beyond a full refill window — bucket caps at 3, not more.
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('k', 3, 60_000, 10_000_000).allowed).toBe(true)
    }
    expect(checkRateLimit('k', 3, 60_000, 10_000_000).allowed).toBe(false)
  })

  it('reports Retry-After as whole seconds until the next token', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('k', 3, 60_000, 0)
    // rate = 1 token / 20_000ms; 0 tokens → need 20s for the next one.
    const blocked = checkRateLimit('k', 3, 60_000, 0)
    expect(blocked.retryAfterSeconds).toBe(20)
  })

  it('rounds Retry-After up', () => {
    for (let i = 0; i < 1; i++) checkRateLimit('k', 1, 5_000, 0)
    // capacity 1 over 5s → 1 token / 5000ms. 100ms elapsed → ~4.9s left → 5.
    expect(checkRateLimit('k', 1, 5_000, 100).retryAfterSeconds).toBe(5)
  })

  it('tracks keys independently', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('a', 3, 60_000, 0)
    expect(checkRateLimit('a', 3, 60_000, 0).allowed).toBe(false)
    expect(checkRateLimit('b', 3, 60_000, 0).allowed).toBe(true)
  })
})
