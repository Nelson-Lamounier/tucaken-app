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
import { getCookie, deleteCookie } from '@tanstack/react-start/server'
import { verifyCognitoJwt } from '@/lib/auth/tanstack-auth'
import { securityHeadersMiddleware } from './security-headers'

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
      console.error('[auth] JWT verification failed:', message)
      // Clear the stale cookie so the browser stops sending it on every request.
      deleteCookie('__session', { path: '/' })
      return null
    }
  })
