import { describe, it, expect } from 'vitest'
import {
  computeIdlePhase,
  secondsUntilIdleExpiry,
  DEFAULT_IDLE_CONFIG,
} from '@/features/auth/session-idle'

/**
 * Idle session state machine for the expiry-warning guard:
 * active → warning (modal + countdown) → expired (forced sign-out).
 * Pure functions over timestamps so timer behaviour is testable
 * without fake DOM events.
 */

const cfg = { idleLimitMs: 45 * 60_000, warnWindowMs: 2 * 60_000 }
const T0 = 1_800_000_000_000

describe('computeIdlePhase', () => {
  it('is active immediately after user activity', () => {
    expect(computeIdlePhase(T0 + 1000, T0, cfg)).toBe('active')
  })

  it('stays active until the warning window opens', () => {
    const justBeforeWarn = T0 + cfg.idleLimitMs - cfg.warnWindowMs - 1
    expect(computeIdlePhase(justBeforeWarn, T0, cfg)).toBe('active')
  })

  it('enters warning inside the warn window', () => {
    const inWarnWindow = T0 + cfg.idleLimitMs - cfg.warnWindowMs + 1000
    expect(computeIdlePhase(inWarnWindow, T0, cfg)).toBe('warning')
  })

  it('expires once the idle limit passes', () => {
    expect(computeIdlePhase(T0 + cfg.idleLimitMs + 1, T0, cfg)).toBe('expired')
  })

  it('ships sane defaults: warn window shorter than idle limit', () => {
    expect(DEFAULT_IDLE_CONFIG.warnWindowMs).toBeLessThan(DEFAULT_IDLE_CONFIG.idleLimitMs)
  })
})

describe('secondsUntilIdleExpiry', () => {
  it('counts down whole seconds to the idle limit', () => {
    const now = T0 + cfg.idleLimitMs - 90_000
    expect(secondsUntilIdleExpiry(now, T0, cfg)).toBe(90)
  })

  it('never goes below zero', () => {
    expect(secondsUntilIdleExpiry(T0 + cfg.idleLimitMs + 5000, T0, cfg)).toBe(0)
  })
})
