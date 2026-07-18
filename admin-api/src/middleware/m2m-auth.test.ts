/** @format */
import { jest } from '@jest/globals';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Stub `jose` so jwtVerify is fully controllable — no real JWKS fetch.
// We use jest.unstable_mockModule (ESM-safe) to intercept the jose import
// before m2m-auth.ts loads, the same pattern used elsewhere for jose-dependent modules.
// ---------------------------------------------------------------------------

let jwtVerifyImpl: (_token: string, _jwks: unknown, _opts: unknown) => Promise<{ payload: Record<string, unknown> }>;

jest.unstable_mockModule('jose', () => ({
  createRemoteJWKSet: (_url: URL) => 'stub-jwks',
  jwtVerify: async (token: string, jwks: unknown, opts: unknown) =>
    jwtVerifyImpl(token, jwks, opts),
}));

const { cognitoM2MAuth } = await import('./m2m-auth.js');

// ---------------------------------------------------------------------------
// Helper: build a minimal Hono app with the middleware on GET /ping
// ---------------------------------------------------------------------------

const REQUIRED_SCOPE = 'tucaken-internal/write:billing';

const M2M_OPTS = {
  userPoolId:    'eu-west-2_TESTPOOL',
  issuerUrl:     'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_TESTPOOL',
  region:        'eu-west-2',
  requiredScope: REQUIRED_SCOPE,
};

function buildApp() {
  const app = new Hono();
  app.use('/ping', cognitoM2MAuth(M2M_OPTS));
  app.get('/ping', (ctx) => {
    const isService = ctx.get('isServiceToken' as never);
    return ctx.json({ ok: true, isServiceToken: isService });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cognitoM2MAuth middleware', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await app.request('/ping');
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization is not a Bearer token', async () => {
    const res = await app.request('/ping', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when jwtVerify throws (bad signature / expired)', async () => {
    jwtVerifyImpl = async () => {
      throw new Error('JWTExpired');
    };
    const res = await app.request('/ping', {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token_use is not "access" (e.g. an ID token)', async () => {
    // Cognito ID tokens carry token_use='id'. A user JWT must never pass.
    jwtVerifyImpl = async () => ({
      payload: {
        token_use: 'id',
        scope:     REQUIRED_SCOPE,
        sub:       'user-cognito-sub',
      },
    });
    const res = await app.request('/ping', {
      headers: { Authorization: 'Bearer id-token-value' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Unauthorised');
  });

  it('returns 403 when scope is missing the required scope', async () => {
    jwtVerifyImpl = async () => ({
      payload: {
        token_use: 'access',
        scope:     'tucaken-internal/read:something-else',
        sub:       'm2m-client-id',
      },
    });
    const res = await app.request('/ping', {
      headers: { Authorization: 'Bearer access-no-billing-scope' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Forbidden');
  });

  it('passes through and sets isServiceToken when scope is correct', async () => {
    jwtVerifyImpl = async () => ({
      payload: {
        token_use: 'access',
        scope:     `other-scope ${REQUIRED_SCOPE} another-scope`,
        sub:       'm2m-client-id',
      },
    });
    const res = await app.request('/ping', {
      headers: { Authorization: `Bearer valid-m2m-token` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; isServiceToken: boolean };
    expect(body.ok).toBe(true);
    expect(body.isServiceToken).toBe(true);
  });
});
