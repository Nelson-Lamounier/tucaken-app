/**
 * @format
 * Tests for admin-api routes/prompt-feedback.ts.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const createPromptFeedbackMock = jest.fn<() => Promise<object>>().mockResolvedValue({
  id: 'feedback-1',
});
const getPromptQualityStatsMock = jest.fn<() => Promise<object[]>>().mockResolvedValue([
  { pipeline: 'applications', agent: 'research', totalInvocations: 3 },
]);

jest.unstable_mockModule('../../src/lib/repositories/prompt-observability.js', () => ({
  createPromptFeedback:  createPromptFeedbackMock,
  getPromptQualityStats: getPromptQualityStatsMock,
}));

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
  getPool: jest.fn(() => ({ query: jest.fn() })),
}));

const { Hono } = await import('hono');
const { createPromptFeedbackRouter } = await import('../../src/routes/prompt-feedback.js');

const testConfig = {
  assetsBucketName: 'test-bucket',
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

function buildApp(groups: string[] = ['admin']) {
  const app = new Hono();
  app.use('*', async (ctx, next) => {
    (ctx as any).set('jwtPayload', { sub: 'test-user', 'cognito:groups': groups });
    (ctx as any).set('userId', '00000000-0000-0000-0000-000000000001');
    await next();
  });
  app.route('/', createPromptFeedbackRouter(testConfig as any));
  return app;
}

describe('prompt feedback routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createPromptFeedbackMock.mockResolvedValue({ id: 'feedback-1' });
    getPromptQualityStatsMock.mockResolvedValue([
      { pipeline: 'applications', agent: 'research', totalInvocations: 3 },
    ]);
  });

  it('allows normal authenticated users to submit their own feedback', async () => {
    const res = await buildApp([]).request('/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rating: 1 }),
    });

    expect(res.status).toBe(201);
    expect(createPromptFeedbackMock).toHaveBeenCalledTimes(1);
  });

  it('forbids non-admin users from reading global prompt quality stats', async () => {
    const res = await buildApp([]).request('/stats?days=30');

    expect(res.status).toBe(403);
    expect(getPromptQualityStatsMock).not.toHaveBeenCalled();
  });

  it('allows admin users to read global prompt quality stats', async () => {
    const res = await buildApp(['admin']).request('/stats?days=30');
    const body = await res.json() as { stats: unknown[] };

    expect(res.status).toBe(200);
    expect(body.stats).toHaveLength(1);
    expect(getPromptQualityStatsMock).toHaveBeenCalledWith(expect.anything(), 30);
  });
});
