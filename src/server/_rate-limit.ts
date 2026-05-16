/**
 * @format
 * In-memory token-bucket rate limiter for auth server functions.
 *
 * Token bucket (not fixed window): each key owns a bucket of `limit` tokens
 * that refills continuously at `limit / windowMs` tokens per ms. A request
 * costs one token; an empty bucket is rejected. This avoids the fixed-window
 * burst edge (2× the limit straddling a reset boundary) and lets callers
 * recover smoothly instead of all-at-once at a hard reset.
 *
 * Scope & limitations:
 *   - Per-process state (a Map). With >1 SSR replica the effective limit is
 *     `limit × replicas`. Defence-in-depth on top of Cognito account lockout
 *     and the edge WAF rate rule — NOT the sole control. A shared store
 *     (Redis) would be required for a strict global limit.
 *   - Keyed by caller IP + action so a brute-force on one account/endpoint
 *     does not consume another's budget.
 */

interface Bucket {
  /** Fractional tokens currently available (0 .. capacity). */
  tokens: number
  /** Epoch ms of the last refill calculation. */
  lastRefill: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the next whole token is available — 0 when allowed. */
  retryAfterSeconds: number
  /** Whole tokens left in the bucket after this call. */
  remaining: number
}

/**
 * Spend one token against `key`'s bucket and report whether it was allowed.
 *
 * @param key       Stable identifier, e.g. `signin:1.2.3.4`.
 * @param limit     Bucket capacity (max burst).
 * @param windowMs  Time to refill a full bucket → rate = limit / windowMs.
 * @param now       Injectable clock (defaults to Date.now()) for tests.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const refillPerMs = limit / windowMs

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now }
    buckets.set(key, bucket)
  }

  // Continuous refill, capped at capacity (no hoarding while idle).
  const elapsed = Math.max(0, now - bucket.lastRefill)
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillPerMs)
  bucket.lastRefill = now

  if (bucket.tokens < 1) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((1 - bucket.tokens) / refillPerMs / 1000),
      remaining: 0,
    }
  }

  bucket.tokens -= 1
  return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(bucket.tokens) }
}

/** Test-only: clear all buckets so suites start from a known state. */
export function _resetRateLimits(): void {
  buckets.clear()
}

// ── Auth-endpoint enforcement ─────────────────────────────────────────────────

import { getRequest, setResponseHeader } from '@tanstack/react-start/server'

/** Per-action budgets. Auth endpoints get the strictest limits. */
const AUTH_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  signin:          { limit: 8,  windowMs: 15 * 60_000 },
  signup:          { limit: 5,  windowMs: 15 * 60_000 },
  confirm:         { limit: 8,  windowMs: 15 * 60_000 },
  mfa:             { limit: 8,  windowMs: 15 * 60_000 },
  forgot_password: { limit: 5,  windowMs: 15 * 60_000 },
  resend_code:     { limit: 4,  windowMs: 15 * 60_000 },
}

/** Best-effort caller IP from edge headers; 'unknown' groups un-attributable callers. */
function callerIp(): string {
  try {
    const h = getRequest().headers
    const xff = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (xff) return xff
    return h.get('x-real-ip') ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Throttle a sensitive auth action by caller IP. On breach: sets a
 * `Retry-After` header and throws a generic error (no account/email
 * echoed back — avoids enumeration). No-op under Vitest so the pure
 * limiter is unit-tested in isolation without coupling auth suites to
 * shared window state.
 *
 * @throws {Error} when the per-IP budget for `action` is exhausted.
 */
export function enforceAuthRateLimit(action: keyof typeof AUTH_LIMITS): void {
  if (process.env['VITEST']) return

  const cfg = AUTH_LIMITS[action]
  const ip = callerIp()
  const result = checkRateLimit(`${action}:${ip}`, cfg.limit, cfg.windowMs)

  if (!result.allowed) {
    try {
      setResponseHeader('Retry-After', String(result.retryAfterSeconds))
    } catch {
      /* header sink unavailable outside a request — limiter still throws */
    }
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        service: 'tucaken-app',
        event: 'auth_rate_limited',
        action,
        retry_after_s: result.retryAfterSeconds,
        timestamp: new Date().toISOString(),
      }) + '\n',
    )
    throw new Error(
      `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`,
    )
  }
}
