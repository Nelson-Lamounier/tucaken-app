import { describe, it, expect } from 'vitest'
import { shouldRefreshToken, REFRESH_AHEAD_SECONDS } from '@/lib/auth/session-refresh-policy'

/**
 * The silent-refresh decision: refresh when the id_token is expired or
 * inside the refresh-ahead window, never for a comfortably valid token.
 * Keeping this pure keeps the server refresh path deterministic and
 * testable without Cognito.
 */

const NOW_MS = 1_800_000_000_000 // fixed instant
const nowSec = NOW_MS / 1000

describe('shouldRefreshToken', () => {
  it('does not refresh a token with plenty of life left', () => {
    expect(shouldRefreshToken(nowSec + 3000, NOW_MS)).toBe(false)
  })

  it('refreshes inside the refresh-ahead window', () => {
    expect(shouldRefreshToken(nowSec + REFRESH_AHEAD_SECONDS - 1, NOW_MS)).toBe(true)
  })

  it('refreshes an already-expired token', () => {
    expect(shouldRefreshToken(nowSec - 10, NOW_MS)).toBe(true)
  })

  it('treats a missing exp claim as needing refresh', () => {
    expect(shouldRefreshToken(undefined, NOW_MS)).toBe(true)
  })
})
