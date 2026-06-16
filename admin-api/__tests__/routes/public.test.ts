/**
 * @format
 * Tests for unauthenticated public admin-api routes.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const userExistsByEmailMock = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

jest.unstable_mockModule('../../src/lib/repositories/users.js', () => ({
  userExistsByEmail: userExistsByEmailMock,
}));

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
  getPool: jest.fn(() => ({ query: jest.fn() })),
}));

const { Hono } = await import('hono');
const { createPublicRouter } = await import('../../src/routes/public.js');

const testConfig = {
  assetsBucketName: undefined,
  cognitoUserPoolId: 'eu-west-1_TestPool',
  cognitoClientId: 'testClient',
  cognitoIssuerUrl: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_TestPool',
  awsRegion: 'eu-west-1',
  port: 3002,
  pgHost: 'pg',
  pgPort: 5432,
  pgDatabase: 'tucaken',
  pgUser: 'postgres',
  pgPassword: 'secret',
} as const;

function buildApp() {
  const app = new Hono();
  app.route('/', createPublicRouter(testConfig as any));
  return app;
}

describe('GET /email-exists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userExistsByEmailMock.mockResolvedValue(false);
  });

  it('rate limits repeated unauthenticated email enumeration attempts by caller IP', async () => {
    const app = buildApp();
    const headers = { 'x-forwarded-for': '203.0.113.10' };

    for (let i = 0; i < 10; i += 1) {
      const res = await app.request(`/email-exists?email=user${i}@example.com`, { headers });
      expect(res.status).toBe(200);
    }

    const blocked = await app.request('/email-exists?email=blocked@example.com', { headers });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });
});
