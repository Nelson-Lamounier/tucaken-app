/**
 * @format
 * admin-api — Cognito M2M (client_credentials) access-token middleware.
 *
 * `/api/internal/*` routes are called by other Tucaken pods (currently only
 * the tucaken-app SSR webhook handler) using a service-account access token
 * minted from the Cognito `client_credentials` OAuth2 grant.
 *
 * These tokens differ from user ID tokens validated by `cognitoJwtAuth`:
 *   - `token_use: 'access'`        — NOT `'id'`
 *   - No `email`/`sub` (user) claims; the `sub` is the app client ID
 *   - Carry a `scope` claim with space-separated scopes like
 *     `tucaken-internal/write:billing`
 *
 * We verify the same JWKS (same User Pool issues them) and require the
 * configured scope before letting the request through. No user-provision
 * runs — service tokens have no user attached.
 *
 * See docs/billing-integration.md ("Service-to-service auth (Cognito M2M)")
 * for the full architecture.
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(userPoolId: string, region: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache.has(userPoolId)) {
    const url = new URL(
      `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
    );
    jwksCache.set(userPoolId, createRemoteJWKSet(url));
  }
  return jwksCache.get(userPoolId)!;
}

interface M2MAuthOptions {
  userPoolId: string;
  issuerUrl:  string;
  region:     string;
  /** e.g. 'tucaken-internal/write:billing' — must appear in the token's `scope` claim. */
  requiredScope: string;
}

/**
 * Returns a Hono middleware that validates a Cognito client_credentials
 * access token and asserts the required scope.
 *
 * Failure modes:
 *   - missing/invalid Authorization header → 401
 *   - token signature/issuer/expiry invalid → 401
 *   - token_use ≠ 'access' (caller sent an ID token) → 401
 *   - scope claim missing the required scope → 403
 *
 * On success, `ctx.set('isServiceToken', true)` and the token payload is
 * attached as `ctx.set('serviceTokenPayload', payload)` for diagnostics.
 */
export function cognitoM2MAuth(opts: M2MAuthOptions): MiddlewareHandler {
  return async (ctx: Context, next: Next): Promise<void> => {
    const authHeader = ctx.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      ctx.res = new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
      return;
    }

    const token = authHeader.slice(7);
    const jwks  = getJwks(opts.userPoolId, opts.region);

    let payload: JWTPayload;
    try {
      // M2M tokens use the same issuer as user tokens. We intentionally do
      // NOT validate `audience` — for client_credentials, Cognito populates
      // `client_id` instead of `aud` and the value is the M2M app client,
      // which varies per environment.
      const result = await jwtVerify(token, jwks, { issuer: opts.issuerUrl });
      payload = result.payload as JWTPayload;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token validation failed';
      ctx.res = new Response(
        JSON.stringify({ error: 'Unauthorised', detail: message }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
      return;
    }

    if (payload['token_use'] !== 'access') {
      ctx.res = new Response(
        JSON.stringify({
          error: 'Unauthorised',
          detail: "token_use must be 'access' (service tokens only)",
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
      return;
    }

    // Cognito returns scopes as a space-separated string.
    const scopes = String(payload['scope'] ?? '').split(' ').filter(Boolean);
    if (!scopes.includes(opts.requiredScope)) {
      ctx.res = new Response(
        JSON.stringify({
          error:  'Forbidden',
          detail: `Token missing required scope '${opts.requiredScope}'`,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
      return;
    }

    ctx.set('isServiceToken', true);
    ctx.set('serviceTokenPayload', payload);
    await next();
  };
}
