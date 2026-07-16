/**
 * @format
 * OAuth callback server function — separated from auth.ts to avoid circular
 * chunk dependencies in the production bundle.
 *
 * `handleAuthCallbackFn` is imported by the sign-in/callback route's
 * `beforeLoad`, which is statically included in the route tree (main bundle).
 * Keeping it in auth.ts would create a circular import between the main bundle
 * and the lazy auth chunk (both needing each other at module init time).
 */

import { createServerFn } from '@tanstack/react-start'
import { getCookie, deleteCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getAppOrigin } from './app-origin'
import { setSessionCookies } from './session-refresh'

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

const authCallbackSchema = z.object({
  code: z.string().min(1, 'Authorisation code is required'),
  state: z.string().min(1, 'OAuth state parameter is required'),
})

/**
 * Handles the OAuth callback — exchanges the authorisation code for tokens,
 * verifies the CSRF state parameter, and sets the session cookie.
 *
 * @throws If PKCE verifier or OAuth state cookies are missing/mismatched
 */
export const handleAuthCallbackFn = createServerFn({ method: 'POST' })
  .inputValidator(authCallbackSchema)
  .handler(async ({ data }) => {
    const { code, state } = data
    const codeVerifier = getCookie('pkce_verifier')

    if (!codeVerifier) {
      throw new Error('Missing PKCE verifier cookie — session may have expired')
    }

    const storedState = getCookie('oauth_state')
    if (!storedState) {
      throw new Error('Missing OAuth state cookie — session may have expired')
    }
    if (state !== storedState) {
      throw new Error('OAuth state mismatch — potential CSRF attack')
    }

    const appUrl = getAppOrigin()
    const scheme = appUrl.startsWith('https://') ? 'https' : 'http'
    const host = appUrl.replace(/^https?:\/\//, '')
    // Must match Cognito App Client → Allowed callback URLs exactly.
    const redirectUri = `${scheme}://${host}/sign-in/callback`

    const { exchangeCognitoCode } = await import('@/lib/auth/tanstack-auth')
    const tokenRes = await exchangeCognitoCode(code, codeVerifier, redirectUri)

    setSessionCookies(tokenRes.id_token, tokenRes.refresh_token)

    deleteCookie('pkce_verifier', { path: '/' })
    deleteCookie('oauth_state', { path: '/' })

    // Detect first-time sign-up while we still have the token in scope.
    // getMeFn() can't be used here because getCookie reads request cookies —
    // the __session cookie we just set won't be visible until the next request.
    let isNewUser = false
    try {
      const meRes = await fetch(`${ADMIN_API_URL}/api/admin/me`, {
        headers: { Authorization: `Bearer ${tokenRes.id_token}` },
      })
      if (meRes.ok) {
        const me = await meRes.json() as { isNew?: boolean }
        isNewUser = me.isNew === true
      }
    } catch {
      // non-fatal — fall back to returning isNewUser: false
    }

    return { success: true, isNewUser }
  })
