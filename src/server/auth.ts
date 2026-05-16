/**
 * @format
 * Authentication server functions for TanStack Start admin dashboard.
 *
 * Handles OAuth PKCE flow with AWS Cognito, session management via
 * secure HTTP-only cookies, and JWT verification.
 */

import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  generateRandomString,
  generateCodeChallenge,
} from '@/lib/auth/tanstack-auth'
import { MOCK_AUTH } from './_dev-mock'
import { enforceAuthRateLimit } from './_rate-limit'

// Re-export types from session.ts so existing import paths keep working.
export type { AuthUser, AuthState } from './session'

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

// Secure cookies require HTTPS. In local Docker (http://localhost) we must
// set this to false or browsers reject/ignore the cookie.
const SECURE_COOKIES =
  process.env.NODE_ENV === 'production' &&
  (process.env['VITE_APP_URL']?.startsWith('https') ?? true)

// ── Structured auth event logger ──────────────────────────────────────────────
// Server functions run in Node; JSON stdout is scraped by Alloy → Loki.
// Fields: level, service, env, event, timestamp + per-event context.
// Credentials (password, tokens) are never logged.
const SVC = { service: 'tucaken-app', env: process.env['DEPLOY_ENV'] ?? 'development' }

function logAuth(event: string, ctx: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({ level: 'info', ...SVC, event, ...ctx, timestamp: new Date().toISOString() }) + '\n',
  )
}

function logAuthError(event: string, error: string, ctx: Record<string, unknown> = {}): void {
  process.stderr.write(
    JSON.stringify({ level: 'error', ...SVC, event, error, ...ctx, timestamp: new Date().toISOString() }) + '\n',
  )
}

async function detectNewUser(idToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/admin/me`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!res.ok) {
      logAuthError('auth_detect_new_user_failed', `admin-api responded ${res.status}`, { status: res.status })
      return false
    }
    const me = await res.json() as { isNew?: boolean }
    logAuth('auth_detect_new_user', { isNew: me.isNew === true })
    return me.isNew === true
  } catch (e) {
    logAuthError('auth_detect_new_user_failed', e instanceof Error ? e.message : 'network error', { adminApiUrl: ADMIN_API_URL })
    return false
  }
}

const loginUrlSchema = z.object({
  provider: z.enum(['Google', 'GitHub', 'LoginWithAmazon']).optional(),
})

/**
 * Initiates the OAuth PKCE flow.
 * Generates verifier, sets cookie, and returns the Cognito authorisation URL.
 * Optionally accepts a `provider` to trigger Cognito identity federation (Google / GitHub).
 */
export const getLoginUrlFn = createServerFn({ method: 'POST' })
  .inputValidator(loginUrlSchema)
  .handler(async ({ data }) => {
    const codeVerifier = generateRandomString(64)
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateRandomString(32)

    // Store verifier + state for the callback route
    setCookie('pkce_verifier', codeVerifier, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      maxAge: 60 * 15, // 15 mins
      path: '/',
    })

    setCookie('oauth_state', state, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      maxAge: 60 * 15,
      path: '/',
    })

    const domain = process.env.AUTH_COGNITO_DOMAIN
    const clientId = process.env.AUTH_COGNITO_ID || process.env.AUTH_COGNITO_CLIENT_ID
    if (!domain) throw new Error('Missing AUTH_COGNITO_DOMAIN')
    if (!clientId) throw new Error('Missing Cognito Client ID')

    const authUrl = new URL(`https://${domain}/oauth2/authorize`)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'email openid profile')

    const appUrl = process.env.VITE_APP_URL || 'http://localhost:5001'
    const scheme = appUrl.startsWith('https://') ? 'https' : 'http'
    const host = appUrl.replace(/^https?:\/\//, '')
    // Must match Cognito App Client → Allowed callback URLs exactly.
    const redirectUri = `${scheme}://${host}/sign-in/callback`

    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    if (data.provider) {
      authUrl.searchParams.set('identity_provider', data.provider)
    }

    return authUrl.toString()
  },
)

// =============================================================================
// Direct Password Auth (USER_PASSWORD_AUTH flow — bypasses Hosted UI)
// Prerequisite: App Client must have ALLOW_USER_PASSWORD_AUTH in ExplicitAuthFlows
// =============================================================================

function regionFromEnv(): string {
  // Prefer issuer: https://cognito-idp.{region}.amazonaws.com/{poolId}
  const issuer = process.env.AUTH_COGNITO_ISSUER
  if (issuer) {
    const m = issuer.match(/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com/)
    if (m) return m[1]
  }
  // Fallback: domain like portfolio-admin.auth.eu-west-1.amazoncognito.com
  const domain = process.env.AUTH_COGNITO_DOMAIN
  if (domain) {
    const m = domain.match(/\.auth\.([a-z0-9-]+)\.amazoncognito\.com/)
    if (m) return m[1]
  }
  throw new Error('Cannot determine AWS region — set AUTH_COGNITO_ISSUER or AUTH_COGNITO_DOMAIN')
}

function makeCognitoClient(): { client: CognitoIdentityProviderClient; clientId: string } {
  const clientId = process.env.AUTH_COGNITO_ID || process.env.AUTH_COGNITO_CLIENT_ID
  if (!clientId) throw new Error('Missing Cognito Client ID (AUTH_COGNITO_ID)')
  return { client: new CognitoIdentityProviderClient({ region: regionFromEnv() }), clientId }
}

const signInPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type SignInResult =
  | { success: true; isNewUser: boolean }
  | { success: false; challenge: 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | string }

export const signInWithPasswordFn = createServerFn({ method: 'POST' })
  .inputValidator(signInPasswordSchema)
  .handler(async ({ data }): Promise<SignInResult> => {
    enforceAuthRateLimit('signin')
    if (MOCK_AUTH) return { success: true, isNewUser: true }

    const { client, clientId } = makeCognitoClient()

    let res
    try {
      res = await client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: clientId,
          AuthParameters: {
            USERNAME: data.email,
            PASSWORD: data.password,
          },
        }),
      )
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAuthorizedException' || err.name === 'UserNotFoundException') {
          logAuthError('auth_signin_failed', 'invalid credentials', { errorCode: err.name })
          throw new Error('Incorrect email or password')
        }
        logAuthError('auth_signin_failed', err.message, { errorCode: err.name })
        throw new Error(err.message)
      }
      throw new Error('Authentication failed')
    }

    if (res.AuthenticationResult?.IdToken) {
      const idToken = res.AuthenticationResult.IdToken
      setCookie('__session', idToken, {
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
        path: '/',
      })
      const isNewUser = await detectNewUser(idToken)
      logAuth('auth_signin_success', { isNewUser, method: 'password' })
      return { success: true, isNewUser }
    }

    if (res.ChallengeName) {
      // Store session token so OTP step can complete the challenge
      setCookie('mfa_session', res.Session ?? '', {
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'lax',
        maxAge: 60 * 5,
        path: '/',
      })
      setCookie('mfa_username', data.email, {
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'lax',
        maxAge: 60 * 5,
        path: '/',
      })
      return { success: false, challenge: res.ChallengeName }
    }

    throw new Error('Unexpected authentication response')
  })

const respondToMfaSchema = z.object({
  code: z.string().length(6),
})

export const respondToMfaChallengeFn = createServerFn({ method: 'POST' })
  .inputValidator(respondToMfaSchema)
  .handler(async ({ data }) => {
    enforceAuthRateLimit('mfa')
    const { client, clientId } = makeCognitoClient()

    const session = getCookie('mfa_session')
    const username = getCookie('mfa_username')
    if (!session || !username) throw new Error('MFA session expired — please sign in again')

    let res
    try {
      res = await client.send(
        new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: 'SOFTWARE_TOKEN_MFA',
          Session: session,
          ChallengeResponses: {
            USERNAME: username,
            SOFTWARE_TOKEN_MFA_CODE: data.code,
          },
        }),
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CodeMismatchException') {
        throw new Error('Invalid code — please try again')
      }
      throw new Error(err instanceof Error ? err.message : 'MFA verification failed')
    }

    if (!res.AuthenticationResult?.IdToken) throw new Error('MFA verification failed')

    setCookie('__session', res.AuthenticationResult.IdToken, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    deleteCookie('mfa_session', { path: '/' })
    deleteCookie('mfa_username', { path: '/' })

    return { success: true }
  })

// =============================================================================
// Email / Password Sign-Up
// =============================================================================

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
})

const ALREADY_HAS_ACCOUNT_MSG =
  'An account with this email already exists. Please sign in instead.'

export const signUpFn = createServerFn({ method: 'POST' })
  .inputValidator(signUpSchema)
  .handler(async ({ data }) => {
    enforceAuthRateLimit('signup')
    if (MOCK_AUTH) return { success: true }

    // ── Pre-check: email already in RDS (Google / GitHub account) ────────────
    // Catches cross-provider duplicates before Cognito creates a conflicting
    // native user. Best-effort — if admin-api is unavailable we fall through
    // and let Cognito's AliasExistsException handle it below.
    try {
      const checkRes = await fetch(
        `${ADMIN_API_URL}/api/public/email-exists?email=${encodeURIComponent(data.email)}`,
      )
      if (checkRes.ok) {
        const { exists } = await checkRes.json() as { exists: boolean }
        if (exists) {
          logAuthError('auth_signup_blocked', 'email already exists in RDS', { reason: 'email_exists' })
          throw new Error(ALREADY_HAS_ACCOUNT_MSG)
        }
      }
    } catch (e) {
      // Re-throw our own error; swallow network/parse failures.
      if (e instanceof Error && e.message === ALREADY_HAS_ACCOUNT_MSG) throw e
    }

    const { client, clientId } = makeCognitoClient()
    try {
      await client.send(
        new SignUpCommand({
          ClientId: clientId,
          Username: data.email,
          Password: data.password,
          UserAttributes: [
            { Name: 'email', Value: data.email },
            { Name: 'name', Value: data.name },
          ],
        }),
      )
    } catch (err: unknown) {
      if (err instanceof Error) {
        // AliasExistsException: pool has email aliasing — same email used by a
        // federated user. UsernameExistsException: exact username collision.
        if (
          err.name === 'AliasExistsException' ||
          err.name === 'UsernameExistsException'
        ) {
          logAuthError('auth_signup_blocked', 'Cognito alias/username collision', { errorCode: err.name })
          throw new Error(ALREADY_HAS_ACCOUNT_MSG)
        }
        if (err.name === 'InvalidPasswordException') {
          logAuthError('auth_signup_failed', 'invalid password policy', { errorCode: err.name })
          throw new Error(err.message)
        }
        logAuthError('auth_signup_failed', err.message, { errorCode: err.name })
        throw new Error(err.message)
      }
      throw new Error('Sign-up failed')
    }
    logAuth('auth_signup_initiated', { method: 'password' })
    return { success: true }
  })

const confirmSignUpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  password: z.string().min(1),
})

export const confirmSignUpFn = createServerFn({ method: 'POST' })
  .inputValidator(confirmSignUpSchema)
  .handler(async ({ data }) => {
    enforceAuthRateLimit('confirm')
    if (MOCK_AUTH) return { success: true, isNewUser: true }

    const { client, clientId } = makeCognitoClient()

    try {
      await client.send(
        new ConfirmSignUpCommand({
          ClientId: clientId,
          Username: data.email,
          ConfirmationCode: data.code,
        }),
      )
    } catch (err: unknown) {
      if (err instanceof Error) {
        logAuthError('auth_confirm_signup_failed', err.message, { errorCode: err.name })
        if (err.name === 'CodeMismatchException') throw new Error('Incorrect verification code — check your email and try again')
        if (err.name === 'ExpiredCodeException')  throw new Error('This code has expired — request a new one below')
        throw new Error(err.message)
      }
      throw new Error('Verification failed')
    }

    // Auto sign-in after confirmation
    let res
    try {
      res = await client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: clientId,
          AuthParameters: { USERNAME: data.email, PASSWORD: data.password },
        }),
      )
    } catch (err: unknown) {
      if (err instanceof Error) {
        logAuthError('auth_confirm_signup_signin_failed', err.message, { errorCode: err.name })
        throw new Error(err.message)
      }
      throw new Error('Authentication failed after email confirmation')
    }

    const idToken = res.AuthenticationResult?.IdToken
    if (!idToken) throw new Error('Authentication failed after email confirmation')

    setCookie('__session', idToken, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    // Provision the user in admin-api (creates the RDS row via userProvisionMiddleware).
    // Result is ignored for routing — a confirmed email is always a new user.
    await detectNewUser(idToken)
    logAuth('auth_signup_confirmed', { method: 'password', isNewUser: true })
    const isNewUser = true
    return { success: true, isNewUser }
  })

export const resendConfirmationCodeFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    enforceAuthRateLimit('resend_code')
    const { client, clientId } = makeCognitoClient()
    await client.send(new ResendConfirmationCodeCommand({ ClientId: clientId, Username: data.email }))
    return { success: true }
  })

// =============================================================================
// Forgot / Reset Password
// =============================================================================

export const forgotPasswordFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    enforceAuthRateLimit('forgot_password')
    const { client, clientId } = makeCognitoClient()
    try {
      await client.send(new ForgotPasswordCommand({ ClientId: clientId, Username: data.email }))
    } catch (err: unknown) {
      // Don't reveal whether the account exists
      if (err instanceof Error && err.name !== 'UserNotFoundException') throw err
    }
    return { success: true }
  })

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  newPassword: z.string().min(8),
})

export const confirmForgotPasswordFn = createServerFn({ method: 'POST' })
  .inputValidator(resetPasswordSchema)
  .handler(async ({ data }) => {
    enforceAuthRateLimit('forgot_password')
    const { client, clientId } = makeCognitoClient()
    try {
      await client.send(
        new ConfirmForgotPasswordCommand({
          ClientId: clientId,
          Username: data.email,
          ConfirmationCode: data.code,
          Password: data.newPassword,
        }),
      )
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'CodeMismatchException') throw new Error('Incorrect code — please try again')
        if (err.name === 'ExpiredCodeException') throw new Error('Code expired — request a new one')
        throw new Error(err.message)
      }
      throw err
    }
    return { success: true }
  })

/** Logs the user out by clearing session cookies and returning logout URL. */
export const logoutFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ appOrigin: z.string().optional() }))
  .handler(async ({ data }) => {
    deleteCookie('__session', { path: '/' })
    deleteCookie('pkce_verifier', { path: '/' })
    deleteCookie('oauth_state', { path: '/' })

    const domain = process.env.AUTH_COGNITO_DOMAIN
    const clientId = process.env.AUTH_COGNITO_ID || process.env.AUTH_COGNITO_CLIENT_ID
    const origin = data.appOrigin ?? process.env.VITE_APP_URL ?? 'http://localhost:5001'
    // Must match Cognito App Client → Allowed sign-out URLs exactly.
    const logoutUri = `${origin}/sign-in`

    let logoutUrl = '/sign-in'
    if (domain && clientId) {
      const url = new URL(`https://${domain}/logout`)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('logout_uri', logoutUri)
      logoutUrl = url.toString()
    }

    return { success: true, logoutUrl }
  })

// Re-export from auth-callback.ts so existing import paths keep working.
export { handleAuthCallbackFn } from './auth-callback'
