/**
 * @format
 * Tests for admin-api auth middleware error surfaces.
 */

import { describe, expect, it, jest } from '@jest/globals';

const jwtVerifyMock = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('jose', () => ({
  createRemoteJWKSet: jest.fn(() => ({})),
  jwtVerify: jwtVerifyMock,
}));

const { Hono } = await import('hono');
const { cognitoJwtAuth, requireAdminGroup } = await import('../../src/middleware/auth.js');

describe('cognitoJwtAuth', () => {
  it('does not expose JWT verification details in 401 responses', async () => {
    jwtVerifyMock.mockRejectedValue(new Error('signature verification failed: internal jwks detail'));

    const app = new Hono();
    app.use('*', cognitoJwtAuth(
      'eu-west-1_TestPool',
      'client-id',
      'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_TestPool',
      'eu-west-1',
    ));
    app.get('/', (ctx) => ctx.json({ ok: true }));

    const res = await app.request('/', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body['error']).toBe('Unauthorised');
    expect(body).not.toHaveProperty('detail');
  });
});

describe('requireAdminGroup', () => {
  it('does not expose required group details in 403 responses', async () => {
    const app = new Hono();
    app.use('*', async (ctx, next) => {
      ctx.set('jwtPayload', { sub: 'user-1', 'cognito:groups': [] });
      await next();
    });
    app.use('*', requireAdminGroup());
    app.get('/', (ctx) => ctx.json({ ok: true }));

    const res = await app.request('/');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body['error']).toBe('Forbidden');
    expect(body).not.toHaveProperty('detail');
  });
});
