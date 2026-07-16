/**
 * @format
 * Silent-refresh decision policy — pure, shared by the server session
 * resolver and its tests. Kept free of cookies/Cognito so the refresh
 * trigger is deterministic.
 */

/**
 * Refresh when the id_token is within this many seconds of expiry, so an
 * active user never crosses the expiry boundary mid-session.
 */
export const REFRESH_AHEAD_SECONDS = 300

/**
 * True when the id_token should be refreshed: already expired, inside the
 * refresh-ahead window, or carrying no readable `exp` claim at all.
 *
 * @param expEpochSeconds - the JWT `exp` claim (seconds since epoch)
 * @param nowMs - current time in milliseconds
 */
export function shouldRefreshToken(expEpochSeconds: number | undefined, nowMs: number): boolean {
  if (typeof expEpochSeconds !== 'number' || !Number.isFinite(expEpochSeconds)) return true
  return expEpochSeconds - nowMs / 1000 <= REFRESH_AHEAD_SECONDS
}
