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
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'
import { z } from 'zod'

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

    const appUrl = process.env.VITE_APP_URL || 'http://localhost:5001'
    const scheme = appUrl.startsWith('https://') ? 'https' : 'http'
    const host = appUrl.replace(/^https?:\/\//, '')
    const redirectUri = `${scheme}://${host}/sign-in/callback`

    const { exchangeCognitoCode } = await import('@/lib/auth/tanstack-auth')
    const tokenRes = await exchangeCognitoCode(code, codeVerifier, redirectUri)

    setCookie('__session', tokenRes.id_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    deleteCookie('pkce_verifier', { path: '/' })
    deleteCookie('oauth_state', { path: '/' })

    return { success: true }
  })
