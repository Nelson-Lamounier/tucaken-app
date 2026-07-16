/**
 * @format
 * Server-side authentication guard for TanStack Start server functions.
 *
 * Provides a reusable `requireAuth()` helper that reads the `__session`
 * cookie and verifies the JWT against Cognito JWKS. All protected server
 * functions should call this at the top of their handler.
 */

import type { AuthUser } from './session'
import { resolveSession } from './session-refresh'
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

  // resolveSession() silently refreshes a near-expiry/expired id_token via
  // the __refresh cookie, so active users never fail this guard at the
  // 60-minute token boundary.
  const payload = await resolveSession()
  if (!payload) {
    throw new AuthenticationError('No session cookie found — session expired or signed out')
  }
  return {
    id: payload.sub as string,
    email: payload['email'] as string,
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

  const payload = await resolveSession()
  if (!payload) {
    throw new AuthenticationError('No session cookie found — session expired or signed out')
  }
  if (!hasAdminGroup(payload['cognito:groups'])) {
    throw new AuthorizationError()
  }
  return {
    id: payload.sub as string,
    email: payload['email'] as string,
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

  const payload = await resolveSession()
  if (!payload) return null
  return {
    id: payload.sub as string,
    email: payload['email'] as string,
  }
}
