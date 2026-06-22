/**
 * @format
 * Tests for admin-api routes/assets.ts.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getSignedUrlMock = jest.fn<() => Promise<string>>().mockResolvedValue('https://s3.example/upload');

jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

const s3SendMock = jest.fn<() => Promise<object>>().mockResolvedValue({});

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: s3SendMock })),
  PutObjectCommand: jest.fn((input: unknown) => ({ input })),
  DeleteObjectCommand: jest.fn((input: unknown) => ({ input })),
}));

const { Hono } = await import('hono');
const { createAssetsRouter } = await import('../../src/routes/assets.js');

const testConfig = {
  assetsBucketName: 'test-assets-bucket',
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
    await next();
  });
  app.route('/', createAssetsRouter(testConfig as any));
  return app;
}

describe('asset routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSignedUrlMock.mockResolvedValue('https://s3.example/upload');
  });

  it('forbids non-admin users from creating article asset upload URLs', async () => {
    const res = await buildApp([]).request('/presign', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        key:           'cover.png',
        contentType:   'image/png',
        contentLength: 1024,
      }),
    });

    expect(res.status).toBe(403);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('rejects SVG uploads even for admin users', async () => {
    const res = await buildApp(['admin']).request('/presign', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        key:           'diagram.svg',
        contentType:   'image/svg+xml',
        contentLength: 1024,
      }),
    });

    expect(res.status).toBe(415);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('allows admin users to create upload URLs for safe image types', async () => {
    const res = await buildApp(['admin']).request('/presign', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        key:           'cover.png',
        contentType:   'image/png',
        contentLength: 1024,
      }),
    });
    const body = await res.json() as { url: string; key: string };

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://s3.example/upload');
    expect(body.key).toBe('articles/cover.png');
  });
});
