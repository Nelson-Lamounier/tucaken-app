/**
 * @format
 * Cognito M2M (client_credentials) access-token client.
 *
 * Mints service-account tokens used to call admin-api /api/internal/*
 * routes. The webhook handler runs without a user session, so we cannot
 * forward a user JWT — instead we authenticate as the `tucaken-app-service`
 * Cognito app client with the `tucaken-internal/write:billing` scope.
 *
 * Tokens are valid 1h. We cache in-process and refresh ~60s before expiry,
 * paid lazily on the next request. No background refresh loop — keeps the
 * module side-effect free and predictable.
 *
 * Required env (set by scripts/setup-cognito-m2m.ts):
 *   COGNITO_DOMAIN              — already used for user OAuth
 *   COGNITO_M2M_CLIENT_ID
 *   COGNITO_M2M_CLIENT_SECRET
 *   COGNITO_M2M_SCOPE           — e.g. 'tucaken-internal/write:billing'
 *
 * See docs/billing-integration.md ("Service-to-service auth (Cognito M2M)")
 * for setup + rotation guidance.
 */

import { logger } from '@/lib/observability/logger'

interface TokenResponse {
  access_token: string
  expires_in:   number // seconds
  token_type:   'Bearer'
}

interface CachedToken {
  token:    string
  /** Unix ms when we should treat the token as expired. */
  expiresAt: number
}

let cached: CachedToken | null = null
/** Single in-flight fetch promise to avoid the thundering-herd on cold start. */
let inflight: Promise<string> | null = null

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set — Cognito M2M cannot mint a token.`)
  return v
}

async function fetchNewToken(): Promise<string> {
  const domain       = env('COGNITO_DOMAIN')
  const clientId     = env('COGNITO_M2M_CLIENT_ID')
  const clientSecret = env('COGNITO_M2M_CLIENT_SECRET')
  const scope        = env('COGNITO_M2M_SCOPE')

  // Cognito's /oauth2/token endpoint expects HTTP Basic auth with the app
  // client's id + secret. Body is application/x-www-form-urlencoded.
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body  = new URLSearchParams({
    grant_type: 'client_credentials',
    scope,
  })

  const url = `https://${domain}/oauth2/token`
  const started = Date.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '<no body>')
    throw new Error(
      `Cognito token endpoint returned ${response.status}: ${detail.slice(0, 200)}`,
    )
  }

  const json = (await response.json()) as TokenResponse
  if (!json.access_token || !json.expires_in) {
    throw new Error('Cognito token endpoint returned an unexpected payload')
  }

  // Refresh slightly before the real expiry so a token never goes stale
  // mid-request. 60 s buffer is plenty given the 1h Cognito default.
  const expiresAt = Date.now() + (json.expires_in - 60) * 1000
  cached = { token: json.access_token, expiresAt }

  logger.info(
    {
      event: 'cognito_m2m_token_minted',
      durationMs: Date.now() - started,
      expiresInSec: json.expires_in,
    },
    'M2M access token minted',
  )
  return json.access_token
}

/**
 * Returns a current M2M access token. Cached until ~60 s before expiry.
 * Safe to call from any number of concurrent webhook handlers — the
 * in-flight promise is deduped.
 */
export async function getM2MToken(): Promise<string> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.token

  if (inflight) return inflight
  inflight = fetchNewToken().finally(() => {
    inflight = null
  })
  return inflight
}

/** Internal — exposed for tests. Clears the in-process cache. */
export function _resetM2MTokenCache(): void {
  cached = null
  inflight = null
}
