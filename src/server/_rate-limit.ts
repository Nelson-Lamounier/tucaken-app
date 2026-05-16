/**
 * @format
 * In-memory fixed-window rate limiter for auth server functions.
 *
 * Scope & limitations:
 *   - Per-process state (a Map). With >1 SSR replica the effective limit is
 *     `limit × replicas`. This is defence-in-depth on top of Cognito's own
 *     account lockout, NOT the sole control. A shared store (Redis) would be
 *     required for a strict global limit — out of scope here.
 *   - Keyed by caller IP + action so a brute-force on one account/endpoint
 *     does not consume another's budget.
 *
 * The window is fixed (not sliding): the first request opens a window of
 * `windowMs`; the counter resets the instant `now >= resetAt`.
 */

interface Bucket {
  count: number
  /** Epoch ms at which the window resets and the counter clears. */
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets — 0 when allowed. */
  retryAfterSeconds: number
  /** Remaining requests in the current window — 0 when blocked. */
  remaining: number
}

/**
 * Record an attempt against `key` and report whether it is allowed.
 *
 * @param key       Stable identifier, e.g. `signin:1.2.3.4`.
 * @param limit     Max attempts permitted per window.
 * @param windowMs  Window length in milliseconds.
 * @param now       Injectable clock (defaults to Date.now()) for tests.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  let bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      remaining: 0,
    }
  }

  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0, remaining: limit - bucket.count }
}

/** Test-only: clear all windows so suites start from a known state. */
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
