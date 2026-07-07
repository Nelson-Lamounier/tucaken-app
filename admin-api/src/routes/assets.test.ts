/** @format */
import { jest } from '@jest/globals';
import { Hono } from 'hono';

const getSignedUrlMock = jest.fn<() => Promise<string>>();
jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (_c: unknown, cmd: { input: { Bucket: string; Key: string } }) => {
    getSignedUrlMock();
    lastInput = cmd.input;
    return Promise.resolve('https://signed.example/put');
  },
}));
let lastInput: { Bucket: string; Key: string } | undefined;

jest.unstable_mockModule('../middleware/auth.js', () => ({
  requireAdminGroup: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

const { createAssetsRouter } = await import('./assets.js');

function app(): Hono {
  const a = new Hono();
  a.route('/', createAssetsRouter({ articleAssetsBucketName: 'article-bkt' } as never));
  return a;
}

function presign(key: string, contentType = 'image/png') {
  return app().request('/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType, contentLength: 123 }),
  });
}

beforeEach(() => { getSignedUrlMock.mockReset(); lastInput = undefined; });

describe('POST /presign — canonical key allowlist', () => {
  it('signs images/articles/<id>.png against the article-assets bucket, key unchanged', async () => {
    const res = await presign('images/articles/bff-architecture-hero.png');
    expect(res.status).toBe(200);
    expect(lastInput).toEqual(expect.objectContaining({
      Bucket: 'article-bkt',
      Key: 'images/articles/bff-architecture-hero.png',
    }));
  });

  it.each([
    'articles/images/articles/x.png',   // legacy forced prefix — no longer accepted
    'images/articles/../resumes/x.png', // traversal
    'resumes/cv.png',                   // foreign prefix
    'images/articles/UPPER.png',        // case
    'images/articles/x.exe',            // extension not in allowlist
  ])('rejects %s with 400 and never signs', async (key) => {
    const res = await presign(key);
    expect(res.status).toBe(400);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('returns 503 when the article bucket is unconfigured', async () => {
    const a = new Hono();
    a.route('/', createAssetsRouter({ articleAssetsBucketName: undefined } as never));
    const res = await a.request('/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'images/articles/x.png', contentType: 'image/png', contentLength: 1 }),
    });
    expect(res.status).toBe(503);
  });
});
