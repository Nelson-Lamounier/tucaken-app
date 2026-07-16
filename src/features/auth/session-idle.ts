/**
 * @format
 * Idle-session state machine — pure functions over timestamps.
 *
 * Drives the session-expiry guard: while the user is `active` the app keeps
 * the Cognito session silently refreshed; entering `warning` shows the
 * "still there?" dialog with a countdown; `expired` forces a clean sign-out.
 * Keeping this pure lets the timer behaviour be unit-tested without DOM
 * events or fake timers.
 */

export type IdlePhase = 'active' | 'warning' | 'expired'

export interface IdleConfig {
  /** Total idle time before the session is closed. */
  idleLimitMs: number
  /** How long before the limit the warning dialog appears. */
  warnWindowMs: number
}

/**
 * 45 minutes of inactivity ends the session; the dialog appears for the
 * final 2 minutes. The id_token (60 min) plus the refresh-ahead window
 * comfortably outlives an active session between keepalive pings.
 */
export const DEFAULT_IDLE_CONFIG: IdleConfig = {
  idleLimitMs: 45 * 60_000,
  warnWindowMs: 2 * 60_000,
}

/** Phase of the idle state machine at `nowMs` given the last user activity. */
export function computeIdlePhase(nowMs: number, lastActivityMs: number, cfg: IdleConfig): IdlePhase {
  const idleFor = nowMs - lastActivityMs
  if (idleFor > cfg.idleLimitMs) return 'expired'
  if (idleFor > cfg.idleLimitMs - cfg.warnWindowMs) return 'warning'
  return 'active'
}

/** Whole seconds remaining until the idle limit; never negative. */
export function secondsUntilIdleExpiry(nowMs: number, lastActivityMs: number, cfg: IdleConfig): number {
  const remainingMs = cfg.idleLimitMs - (nowMs - lastActivityMs)
  return Math.max(0, Math.round(remainingMs / 1000))
}
