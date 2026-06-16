/**
 * @format
 * Server-side authentication guard for TanStack Start server functions.
 *
 * Provides a reusable `requireAuth()` helper that reads the `__session`
 * cookie and verifies the JWT against Cognito JWKS. All protected server
 * functions should call this at the top of their handler.
 */

import { getCookie } from '@tanstack/react-start/server'
import { verifyCognitoJwt } from '@/lib/auth/tanstack-auth'
import type { AuthUser } from './session'
import { MOCK_AUTH, MOCK_USER } from './_dev-mock'

// =============================================================================
// Error Types
// =============================================================================

/**
 * Thrown when a server function is called without a valid session.
 * Differentiated from generic errors so clients can redirect to login.
 */
export class AuthenticationError extends Error {
  public readonly code = 'UNAUTHENTICATED' as const

  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * Thrown when a valid session exists but the user lacks the required role.
 */
export class AuthorizationError extends Error {
  public readonly code = 'FORBIDDEN' as const

  constructor(message = 'Admin access required') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

// =============================================================================
// Guard Helper
// =============================================================================

/**
 * Verifies the current request has a valid authenticated session.
 *
 * Reads the `__session` HTTP-only cookie, verifies the JWT signature
 * against Cognito's JWKS endpoint, and returns the authenticated user.
 *
 * @returns The authenticated user's ID and email
 * @throws {AuthenticationError} If the cookie is missing or the JWT is invalid
 */
export async function requireAuth(): Promise<AuthUser> {
  if (MOCK_AUTH) return MOCK_USER

  const token = getCookie('__session')

  if (!token) {
    throw new AuthenticationError('No session cookie found')
  }

  try {
    const payload = await verifyCognitoJwt(token)
    return {
      id: payload.sub as string,
      email: payload.email as string,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auth-guard] JWT verification failed:', message)
    throw new AuthenticationError('Session expired or invalid')
  }
}

function hasAdminGroup(groups: unknown): boolean {
  if (Array.isArray(groups)) {
    return groups.some((group) => group === 'admin')
  }
  if (typeof groups === 'string') {
    return groups.split(/\s+/).includes('admin')
  }
  return false
}

/**
 * Verifies the current request is authenticated and belongs to the Cognito
 * `admin` group. Use this at the top of server functions that back admin-only
 * dashboard surfaces, even when the UI route is already admin-gated.
 */
export async function requireAdmin(): Promise<AuthUser> {
  if (MOCK_AUTH) return MOCK_USER

  const token = getCookie('__session')

  if (!token) {
    throw new AuthenticationError('No session cookie found')
  }

  try {
    const payload = await verifyCognitoJwt(token)
    if (!hasAdminGroup(payload['cognito:groups'])) {
      throw new AuthorizationError()
    }
    return {
      id: payload.sub as string,
      email: payload.email as string,
    }
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) throw err
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auth-guard] admin JWT verification failed:', message)
    throw new AuthenticationError('Session expired or invalid')
  }
}

/**
 * Non-throwing variant for server functions that work in BOTH authenticated
 * and guest contexts (e.g. createCheckoutSessionFn — the home /pricing page
 * lets unauthenticated buyers pay, then the post-checkout flow asks them to
 * sign up to claim the subscription).
 *
 * Returns null when there is no session cookie OR the JWT is invalid. Logs
 * verification failures (they may indicate tampering) but does not throw.
 */
export async function tryAuth(): Promise<AuthUser | null> {
  if (MOCK_AUTH) return MOCK_USER

  const token = getCookie('__session')
  if (!token) return null

  try {
    const payload = await verifyCognitoJwt(token)
    return {
      id: payload.sub as string,
      email: payload.email as string,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[auth-guard] tryAuth: invalid session cookie ignored —', message)
    return null
  }
}
