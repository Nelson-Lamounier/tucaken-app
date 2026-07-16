/**
 * @format
 * Session server function — separated from auth.ts to avoid circular chunk
 * dependencies in the production bundle.
 *
 * `getUserSessionFn` is imported by `__root.tsx` (main bundle), while the rest
 * of auth.ts is imported by lazy route chunks. Keeping them in the same file
 * causes a circular ES-module live-binding issue where `createServerFn` is
 * `null` at auth-chunk init time.
 */

import { createServerFn } from '@tanstack/react-start'
import { resolveSession } from './session-refresh'
import { securityHeadersMiddleware } from './security-headers'
import { MOCK_AUTH, MOCK_USER } from './_dev-mock'

// =============================================================================
// Types
// =============================================================================

/** Authenticated user shape shared across the admin dashboard */
export interface AuthUser {
  id: string
  email: string
}

/** Authentication state for router context */
export interface AuthState {
  user: AuthUser | null
}

// =============================================================================
// Server Function
// =============================================================================

/**
 * Reads the secure HTTP-only `__session` cookie and verifies the JWT.
 * Used by the router to populate auth context — must NOT call `requireAuth()`
 * since it is the source of auth state.
 */
export const getUserSessionFn = createServerFn({ method: 'GET' })
  .middleware([securityHeadersMiddleware])
  .handler(async (): Promise<AuthUser | null> => {
    if (MOCK_AUTH) return MOCK_USER

    // Silently refreshes near-expiry/expired id_tokens via the __refresh
    // cookie; clears both cookies when no session can be recovered.
    const payload = await resolveSession()
    if (!payload) return null
    return {
      id: payload.sub as string,
      email: payload['email'] as string,
    }
  })
