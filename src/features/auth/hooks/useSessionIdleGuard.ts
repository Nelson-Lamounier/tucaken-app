'use client'

/**
 * Idle-session guard for the authenticated dashboard.
 *
 * Two jobs:
 *  1. Keepalive — while the user is active, ping the session server fn every
 *     KEEPALIVE_INTERVAL_MS. The server side silently refreshes the Cognito
 *     id_token when it nears expiry (src/server/session-refresh.ts), so an
 *     active user never hits the 60-minute token wall even on a page that
 *     makes no API calls.
 *  2. Idle policy — after DEFAULT_IDLE_CONFIG.idleLimitMs without activity,
 *     the session ends. The final warnWindowMs shows a countdown dialog;
 *     "Stay signed in" resets the clock, timeout performs a clean sign-out
 *     (refresh token revoked server-side by logoutFn).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_IDLE_CONFIG,
  computeIdlePhase,
  secondsUntilIdleExpiry,
  type IdlePhase,
} from '../session-idle'
import { getUserSessionFn } from '@/server/session'

/** Activity events that mark the user as present (throttled). */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const
/** Ignore activity events closer together than this. */
const ACTIVITY_THROTTLE_MS = 5_000
/** How often the guard re-evaluates the idle phase. */
const TICK_MS = 1_000
/** Active-session keepalive cadence — triggers server-side silent refresh. */
const KEEPALIVE_INTERVAL_MS = 10 * 60_000

async function signOutToLogin(): Promise<void> {
  let targetUrl = '/sign-in'
  try {
    const { logoutFn } = await import('@/server/auth')
    const res = await logoutFn({ data: { appOrigin: globalThis.location?.origin } })
    if (res?.logoutUrl) targetUrl = res.logoutUrl
  } catch {
    // Fall back to plain sign-in navigation — cookies were cleared best-effort.
  }
  globalThis.location.href = targetUrl
}

export interface SessionIdleGuardState {
  /** Current phase; the dialog renders while 'warning'. */
  phase: IdlePhase
  /** Countdown shown in the warning dialog. */
  secondsLeft: number
  /** "Stay signed in" — resets the idle clock and refreshes the session. */
  staySignedIn: () => void
  /** Explicit "Sign out now" from the dialog. */
  signOutNow: () => void
}

export function useSessionIdleGuard(): SessionIdleGuardState {
  const [phase, setPhase] = useState<IdlePhase>('active')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const lastActivityRef = useRef<number>(Date.now())
  const lastKeepaliveRef = useRef<number>(Date.now())
  const expiredRef = useRef(false)

  // Activity listeners: cheap throttled timestamp updates only. While the
  // warning dialog is open, background activity must NOT dismiss it — the
  // user has to answer explicitly, so we gate on the current phase.
  useEffect(() => {
    let lastMark = 0
    const markActivity = () => {
      const now = Date.now()
      if (now - lastMark < ACTIVITY_THROTTLE_MS) return
      lastMark = now
      if (computeIdlePhase(now, lastActivityRef.current, DEFAULT_IDLE_CONFIG) === 'active') {
        lastActivityRef.current = now
      }
    }
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, markActivity, { passive: true })
    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, markActivity)
    }
  }, [])

  // The 1 s tick drives phase transitions, the countdown, and the keepalive.
  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const nextPhase = computeIdlePhase(now, lastActivityRef.current, DEFAULT_IDLE_CONFIG)
      setPhase(nextPhase)

      if (nextPhase === 'warning') {
        setSecondsLeft(secondsUntilIdleExpiry(now, lastActivityRef.current, DEFAULT_IDLE_CONFIG))
        return
      }
      if (nextPhase === 'expired') {
        if (!expiredRef.current) {
          expiredRef.current = true
          signOutToLogin().catch(() => undefined)
        }
        return
      }
      if (now - lastKeepaliveRef.current >= KEEPALIVE_INTERVAL_MS) {
        lastKeepaliveRef.current = now
        // Fire-and-forget: the server fn refreshes the id_token cookie when
        // it is inside the refresh-ahead window.
        getUserSessionFn().catch(() => undefined)
      }
    }
    const id = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const staySignedIn = useCallback(() => {
    lastActivityRef.current = Date.now()
    lastKeepaliveRef.current = Date.now()
    setPhase('active')
    getUserSessionFn().catch(() => undefined)
  }, [])

  const signOutNow = useCallback(() => {
    expiredRef.current = true
    signOutToLogin().catch(() => undefined)
  }, [])

  return { phase, secondsLeft, staySignedIn, signOutNow }
}
