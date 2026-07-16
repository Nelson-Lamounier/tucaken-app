/**
 * @format
 * Server-side silent session refresh (BFF pattern).
 *
 * Both Cognito tokens live in HTTP-only cookies — nothing is ever exposed
 * to client JavaScript:
 *   __session — the id_token (60-minute validity on the pool client)
 *   __refresh — the refresh token (30-day validity, revocable)
 *
 * `resolveSession()` is the single entry point used by the router session
 * fn and `requireAuth()`. It verifies the id_token and, when the token is
 * expired or inside the refresh-ahead window, silently exchanges the
 * refresh token for a new id_token via Cognito REFRESH_TOKEN_AUTH and
 * re-sets the cookie on the response. Active users therefore never hit the
 * 60-minute wall; sessions end only via idle timeout, explicit sign-out
 * (which revokes the refresh token) or the 30-day refresh ceiling.
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RevokeTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'
import type { JWTPayload } from 'jose'
import { verifyCognitoJwt } from '@/lib/auth/tanstack-auth'
import { shouldRefreshToken } from '@/lib/auth/session-refresh-policy'
import { getAppOrigin } from './app-origin'

export const SESSION_COOKIE = '__session'
export const REFRESH_COOKIE = '__refresh'

/** Matches the pool client's id-token validity (Cognito default: 60 min). */
const SESSION_COOKIE_MAX_AGE = 60 * 60
/** Matches the pool client's refresh-token validity (30 days). */
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

const SECURE_COOKIES =
  process.env.NODE_ENV === 'production' && getAppOrigin().startsWith('https')

function cognitoClient(): { client: CognitoIdentityProviderClient; clientId: string } {
  const clientId = process.env['AUTH_COGNITO_ID'] ?? process.env['AUTH_COGNITO_CLIENT_ID']
  if (!clientId) throw new Error('Missing Cognito Client ID (AUTH_COGNITO_ID)')
  const region =
    process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'eu-west-1'
  return { client: new CognitoIdentityProviderClient({ region }), clientId }
}

/**
 * Sets the session cookies after any successful authentication or refresh.
 * The refresh token is optional because Cognito omits it from
 * REFRESH_TOKEN_AUTH responses unless rotation is configured.
 */
export function setSessionCookies(idToken: string, refreshToken?: string): void {
  setCookie(SESSION_COOKIE, idToken, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  })
  if (refreshToken) {
    setCookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE,
      path: '/',
    })
  }
}

/** Removes both session cookies. */
export function clearSessionCookies(): void {
  deleteCookie(SESSION_COOKIE, { path: '/' })
  deleteCookie(REFRESH_COOKIE, { path: '/' })
}

/**
 * Exchanges the refresh token for a fresh id_token.
 * Returns null on any failure (revoked, expired, network) — callers treat
 * that as "no session" rather than an error.
 */
export async function refreshIdToken(refreshToken: string): Promise<string | null> {
  try {
    const { client, clientId } = cognitoClient()
    const res = await client.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    )
    return res.AuthenticationResult?.IdToken ?? null
  } catch {
    return null
  }
}

/**
 * Best-effort revocation of the refresh token at sign-out. Failures are
 * swallowed — the cookies are cleared regardless, and the pool has
 * EnableTokenRevocation on, so a successful call invalidates every token
 * derived from this refresh token.
 */
export async function revokeRefreshToken(): Promise<void> {
  const refreshToken = getCookie(REFRESH_COOKIE)
  if (!refreshToken) return
  try {
    const { client, clientId } = cognitoClient()
    await client.send(new RevokeTokenCommand({ Token: refreshToken, ClientId: clientId }))
  } catch {
    // Non-fatal: cookie deletion still ends the browser session.
  }
}

/**
 * Resolves the current session, silently refreshing when needed.
 *
 * Order of play:
 *  1. Valid id_token outside the refresh-ahead window → return it.
 *  2. Valid but near expiry → proactive refresh; on refresh failure the
 *     still-valid token is returned (degrade gracefully, retry next call).
 *  3. Invalid/expired id_token + refresh cookie → refresh, verify, return.
 *  4. Nothing usable → clear cookies, return null.
 */
export async function resolveSession(): Promise<JWTPayload | null> {
  const idToken = getCookie(SESSION_COOKIE)
  const refreshToken = getCookie(REFRESH_COOKIE)

  if (idToken) {
    try {
      const payload = await verifyCognitoJwt(idToken)
      if (!shouldRefreshToken(payload.exp, Date.now()) || !refreshToken) {
        return payload
      }
      const renewed = await refreshIdToken(refreshToken)
      if (!renewed) return payload
      const renewedPayload = await verifyCognitoJwt(renewed)
      setSessionCookies(renewed)
      return renewedPayload
    } catch {
      // fall through to the refresh path below
    }
  }

  if (refreshToken) {
    const renewed = await refreshIdToken(refreshToken)
    if (renewed) {
      try {
        const payload = await verifyCognitoJwt(renewed)
        setSessionCookies(renewed)
        return payload
      } catch {
        // verification of a fresh token failing means the session is unusable
      }
    }
  }

  clearSessionCookies()
  return null
}
