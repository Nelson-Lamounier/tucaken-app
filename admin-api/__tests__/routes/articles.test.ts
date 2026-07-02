/**
 * @format
 * Tests for admin-api routes/articles.ts (PG-only after Phase 5).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Repository + pool mocks
// ---------------------------------------------------------------------------

const pgUpsertMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const pgDeleteArticleMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const pgGetArticleBySlugMock = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
const pgGetArticleBySlugForAuthorMock = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
const pgListArticlesByStatusMock = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
const pgListAllArticlesMock = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);

 
const poolQueryMock = jest.fn() as jest.Mock<any>;
poolQueryMock.mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../src/lib/repositories/articles.js', () => ({
    upsertArticle: pgUpsertMock,
    deleteArticle: pgDeleteArticleMock,
    getArticleBySlug: pgGetArticleBySlugMock,
    getArticleBySlugForAuthor: pgGetArticleBySlugForAuthorMock,
    listArticlesByStatus: pgListArticlesByStatusMock,
    listAllArticles: pgListAllArticlesMock,
}));

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
    getPool: jest.fn(() => ({ query: poolQueryMock })),
    withUser: async (_pool: unknown, _userId: string, fn: (db: { query: typeof poolQueryMock }) => Promise<unknown>) =>
        fn({ query: poolQueryMock }),
}));

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { Hono } = await import('hono');
const { createArticlesRouter } = await import('../../src/routes/articles.js');

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------

const testConfig = {
  assetsBucketName: 'test-bucket',
  cognitoUserPoolId: 'eu-west-1_TestPool',
  cognitoClientId: 'testClient',
  cognitoIssuerUrl: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_TestPool',
  awsRegion: 'eu-west-1',
  port: 3002,
  pgHost: 'pgbouncer.platform.svc.cluster.local',
  pgPort: 5432,
  pgDatabase: 'tucaken',
  pgUser: 'postgres',
  pgPassword: 'secret',
} as const;

/**
 * Builds the test Hono app with a stub JWT middleware.
 *
 * @returns Configured Hono app with articles router mounted at /.
 */
function buildApp(groups: string[] = ['admin']) {
  const app = new Hono();
  app.use('*', async (ctx, next) => {
     
    (ctx as any).set('jwtPayload', { sub: 'test-user-sub', 'cognito:groups': groups });
     
    (ctx as any).set('userId', 'test-user-sub');
    await next();
  });
   
  app.route('/', createArticlesRouter(testConfig as any));
  return app;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ARTICLE_ITEM = {
  slug: 'my-slug',
  title: 'My Test Article',
  excerpt: null,
  contentMd: '# Hello',
  tags: ['x'],
  status: 'draft',
  aiGenerated: false,
  aiModel: null,
  publishedAt: null,
  coverImage: null,
};

// ---------------------------------------------------------------------------
// Admin gate
// ---------------------------------------------------------------------------

describe('admin gate', () => {
  it('forbids non-admin users before reading article management data', async () => {
    const res = await buildApp([]).request('/');

    expect(res.status).toBe(403);
    expect(pgListAllArticlesMock).not.toHaveBeenCalled();
  });

  it('forbids non-admin users before mutating article management data', async () => {
    const res = await buildApp([]).request('/my-slug', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title: 'Updated Title' }),
    });

    expect(res.status).toBe(403);
    expect(pgUpsertMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET / — list articles
// ---------------------------------------------------------------------------

describe('GET / — list articles', () => {
  beforeEach(() => {
    pgListAllArticlesMock.mockReset();
    pgListArticlesByStatusMock.mockReset();
  });

  it('calls listAllArticles when ?status=all (default)', async () => {
    pgListAllArticlesMock.mockResolvedValue([ARTICLE_ITEM] as never[]);

    const res = await buildApp().request('/');
    const body = (await res.json()) as { articles: unknown[]; count: number };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(pgListAllArticlesMock).toHaveBeenCalledTimes(1);
  });

  it('calls listArticlesByStatus when ?status=draft', async () => {
    pgListArticlesByStatusMock.mockResolvedValue([ARTICLE_ITEM] as never[]);

    const res = await buildApp().request('/?status=draft');
    const body = (await res.json()) as { articles: unknown[]; count: number };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(pgListArticlesByStatusMock).toHaveBeenCalledWith(expect.anything(), 'draft', 'test-user-sub');
  });

  it('returns 400 for an unknown status value', async () => {
    const res = await buildApp().request('/?status=unknown');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Invalid status/);
  });

  it('returns empty articles array when PG returns no items', async () => {
    pgListArticlesByStatusMock.mockResolvedValue([] as never[]);
    const res = await buildApp().request('/?status=published');
    const body = (await res.json()) as { articles: unknown[]; count: number };
    expect(body.articles).toHaveLength(0);
    expect(body.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /:slug
// ---------------------------------------------------------------------------

describe('GET /:slug — get article by slug (owner-scoped)', () => {
  beforeEach(() => {
    pgGetArticleBySlugForAuthorMock.mockReset();
  });

  it('returns the article when found and owned', async () => {
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(ARTICLE_ITEM as never);

    const res = await buildApp().request('/my-slug');
    const body = (await res.json()) as { article: typeof ARTICLE_ITEM };

    expect(res.status).toBe(200);
    expect(body.article.slug).toBe('my-slug');
    expect(body.article.title).toBe('My Test Article');
  });

  it('scopes the lookup to the signed-in user', async () => {
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(ARTICLE_ITEM as never);

    await buildApp().request('/my-slug');

    expect(pgGetArticleBySlugForAuthorMock).toHaveBeenCalledWith(expect.anything(), 'my-slug', 'test-user-sub');
  });

  it('returns 404 when the article is not found or not owned', async () => {
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(null);

    const res = await buildApp().request('/nonexistent-slug');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Article not found');
  });
});

// ---------------------------------------------------------------------------
// PUT /:slug
// ---------------------------------------------------------------------------

describe('PUT /:slug — update article (PG upsert)', () => {
  beforeEach(() => {
    pgUpsertMock.mockReset();
    pgUpsertMock.mockResolvedValue(undefined);
    pgGetArticleBySlugForAuthorMock.mockReset();
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(ARTICLE_ITEM as never);
  });

  it('returns 200 with updated: true on success', async () => {
    const res = await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    const body = (await res.json()) as { updated: boolean; slug: string };
    expect(res.status).toBe(200);
    expect(body.updated).toBe(true);
    expect(body.slug).toBe('my-slug');
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when body contains no valid fields', async () => {
    const res = await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unknownField: 'value', anotherBadField: 42 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/No valid fields/);
    expect(pgUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 404 when article does not exist or is not owned', async () => {
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(null);
    const res = await buildApp().request('/missing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Whatever' }),
    });
    expect(res.status).toBe(404);
    expect(pgUpsertMock).not.toHaveBeenCalled();
  });

  it('filters out fields not in the allowed list before upserting', async () => {
    await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New', evilField: 'nope' }),
    });
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['title']).toBe('New');
    expect(arg).not.toHaveProperty('evilField');
  });

  it('merges body fields onto the existing article', async () => {
    await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    // status from body, title from existing
    expect(arg['status']).toBe('published');
    expect(arg['title']).toBe('My Test Article');
    expect(arg['slug']).toBe('my-slug');
  });
});

// ---------------------------------------------------------------------------
// DELETE /:slug
// ---------------------------------------------------------------------------

describe('DELETE /:slug — delete article (PG-only, owner-scoped)', () => {
  beforeEach(() => {
    pgDeleteArticleMock.mockReset();
    pgDeleteArticleMock.mockResolvedValue(undefined);
    pgGetArticleBySlugForAuthorMock.mockReset();
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(ARTICLE_ITEM as never);
  });

  it('returns 200 with deleted: true for the owner', async () => {
    const res = await buildApp().request('/my-slug', { method: 'DELETE' });
    const body = (await res.json()) as { deleted: boolean; slug: string };
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(body.slug).toBe('my-slug');
  });

  it('calls pgDeleteArticle exactly once with the slug', async () => {
    await buildApp().request('/my-slug', { method: 'DELETE' });
    expect(pgDeleteArticleMock).toHaveBeenCalledTimes(1);
    expect(pgDeleteArticleMock).toHaveBeenCalledWith(expect.anything(), 'my-slug');
  });

  it("returns 404 without deleting when the article is not owned", async () => {
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(null);
    const res = await buildApp().request('/someone-elses', { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(pgDeleteArticleMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /:slug/publish
// ---------------------------------------------------------------------------

describe('POST /:slug/publish — flip status to published in PG (owner-scoped)', () => {
  beforeEach(() => {
    pgGetArticleBySlugForAuthorMock.mockReset();
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [] });
  });

  it('returns 200 with published: true and runs an owner-scoped UPDATE', async () => {
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(ARTICLE_ITEM as never);

    const res = await buildApp().request('/my-slug/publish', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { published: boolean; slug: string };
    expect(body.published).toBe(true);
    expect(body.slug).toBe('my-slug');

    expect(poolQueryMock).toHaveBeenCalledTimes(1);
    const sql = poolQueryMock.mock.calls[0]?.[0] as string;
    const params = poolQueryMock.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/UPDATE articles/);
    expect(sql).toMatch(/status = 'published'/);
    expect(sql).toMatch(/COALESCE\(published_at, NOW\(\)\)/);
    expect(sql).toMatch(/author_id = \$2/);
    expect(params).toEqual(['my-slug', 'test-user-sub']);
  });

  it('returns 404 when article does not exist or is not owned', async () => {
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(null);

    const res = await buildApp().request('/missing/publish', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST / — create article
// ---------------------------------------------------------------------------

describe('POST / — create article', () => {
  beforeEach(() => {
    pgUpsertMock.mockReset();
    pgUpsertMock.mockResolvedValue(undefined);
    pgGetArticleBySlugMock.mockReset();
    pgGetArticleBySlugMock.mockResolvedValue(null);
  });

  it('creates a new article with status=draft and default destinations', async () => {
    const res = await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'hello-world', title: 'Hi', contentMd: '# Hi' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ created: true, slug: 'hello-world' });
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['slug']).toBe('hello-world');
    expect(arg['status']).toBe('draft');
    expect(arg['destinations']).toEqual(['portfolio']);
  });

  it('rejects a duplicate slug with 409', async () => {
    pgGetArticleBySlugMock.mockResolvedValue(ARTICLE_ITEM as never);
    const res = await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'hello-world', title: 'Hi', contentMd: '# Hi' }),
    });
    expect(res.status).toBe(409);
    expect(pgUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid slug with 400', async () => {
    const res = await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'Bad Slug!', title: 'Hi', contentMd: '# Hi' }),
    });
    expect(res.status).toBe(400);
    expect(pgUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects missing title with 400', async () => {
    const res = await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'valid-slug', contentMd: '# Hi' }),
    });
    expect(res.status).toBe(400);
  });

  it('filters destinations to allowed values and preserves valid ones', async () => {
    await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'valid-slug', title: 'Hi', contentMd: '# Hi', destinations: ['tucaken', 'evil'] }),
    });
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['destinations']).toEqual(['tucaken']);
  });
});

// ---------------------------------------------------------------------------
// GET /slug-available
// ---------------------------------------------------------------------------

describe('GET /slug-available — slug availability check', () => {
  beforeEach(() => {
    pgGetArticleBySlugMock.mockReset();
    pgGetArticleBySlugMock.mockResolvedValue(null);
  });

  it('returns available=false for an existing slug', async () => {
    pgGetArticleBySlugMock.mockResolvedValue(ARTICLE_ITEM as never);
    const res = await buildApp().request('/slug-available?slug=hello-world');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });

  it('returns available=true for a free slug', async () => {
    const res = await buildApp().request('/slug-available?slug=free-slug');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });

  it('returns available=false for an invalid slug format', async () => {
    const res = await buildApp().request('/slug-available?slug=Bad+Slug!');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });
});

// ---------------------------------------------------------------------------
// PUT /:slug destinations patchability
// ---------------------------------------------------------------------------

describe('PUT /:slug — destinations patchable', () => {
  beforeEach(() => {
    pgUpsertMock.mockReset();
    pgUpsertMock.mockResolvedValue(undefined);
    pgGetArticleBySlugForAuthorMock.mockReset();
    pgGetArticleBySlugForAuthorMock.mockResolvedValue({ ...ARTICLE_ITEM, destinations: ['portfolio'] } as never);
  });

  it('updates destinations when provided in body', async () => {
    await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinations: ['tucaken'] }),
    });
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['destinations']).toEqual(['tucaken']);
  });

  it('preserves existing destinations when not in body', async () => {
    await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    });
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['destinations']).toEqual(['portfolio']);
  });
});

// ---------------------------------------------------------------------------
// GET /:slug/versions
// ---------------------------------------------------------------------------

describe('GET /:slug/versions — read pipeline_runs history', () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
  });

  it('returns versions mapped from pipeline_runs rows', async () => {
    const now = new Date('2026-04-25T00:00:00.000Z');
    poolQueryMock.mockResolvedValue({
      rows: [
        {
          id: 'run-1',
          status: 'success',
          metadata: { foo: 'bar' },
          error_message: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'run-2',
          status: 'failed',
          metadata: null,
          error_message: 'boom',
          created_at: now,
          updated_at: now,
        },
      ],
    });

    const res = await buildApp().request('/my-slug/versions');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      slug: string;
      totalVersions: number;
      versions: Array<{ pipelineRunId: string; status: string; errorMessage: string | null }>;
    };

    expect(body.success).toBe(true);
    expect(body.slug).toBe('my-slug');
    expect(body.totalVersions).toBe(2);
    expect(body.versions[0]?.pipelineRunId).toBe('run-1');
    expect(body.versions[0]?.status).toBe('success');
    expect(body.versions[1]?.pipelineRunId).toBe('run-2');
    expect(body.versions[1]?.errorMessage).toBe('boom');

    const sql = poolQueryMock.mock.calls[0]?.[0] as string;
    const params = poolQueryMock.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/FROM pipeline_runs/);
    expect(sql).toMatch(/pipeline_type = 'article'/);
    expect(params).toEqual(['my-slug', 20]);
  });

  it('honours ?limit query param (capped at 50)', async () => {
    poolQueryMock.mockResolvedValue({ rows: [] });
    await buildApp().request('/my-slug/versions?limit=99');
    const params = poolQueryMock.mock.calls[0]?.[1] as unknown[];
    expect(params).toEqual(['my-slug', 50]);
  });

  it('returns empty versions array when pipeline_runs has no rows', async () => {
    poolQueryMock.mockResolvedValue({ rows: [] });
    const res = await buildApp().request('/my-slug/versions');
    const body = (await res.json()) as { totalVersions: number; versions: unknown[] };
    expect(body.totalVersions).toBe(0);
    expect(body.versions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PUT /:slug — destination allowlist filtering (Fix 1)
// ---------------------------------------------------------------------------

describe('PUT /:slug — destination allowlist filtering', () => {
  const existingWithDest = { ...ARTICLE_ITEM, destinations: ['portfolio'] };

  beforeEach(() => {
    pgUpsertMock.mockReset();
    pgUpsertMock.mockResolvedValue(undefined);
    pgGetArticleBySlugForAuthorMock.mockReset();
    pgGetArticleBySlugForAuthorMock.mockResolvedValue(existingWithDest as never);
  });

  it('filters out non-string and disallowed values, keeping only valid destinations', async () => {
    await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinations: ['portfolio', 'bogus', 123] }),
    });
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['destinations']).toEqual(['portfolio']);
  });

  it('falls back to existing destinations when all provided values are invalid', async () => {
    await buildApp().request('/my-slug', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinations: ['bogus', 999] }),
    });
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    // all-invalid → fall back to existing
    expect(arg['destinations']).toEqual(['portfolio']);
  });
});

// ---------------------------------------------------------------------------
// POST / — status validation (Fix 2) and tags filtering (Fix 3)
// ---------------------------------------------------------------------------

describe('POST / — status validation (Fix 2)', () => {
  beforeEach(() => {
    pgUpsertMock.mockReset();
    pgUpsertMock.mockResolvedValue(undefined);
    pgGetArticleBySlugMock.mockReset();
    pgGetArticleBySlugMock.mockResolvedValue(null);
  });

  it('returns 400 for an unknown status value', async () => {
    const res = await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'valid-slug', title: 'Hi', contentMd: '# Hi', status: 'bogus' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid status');
    expect(pgUpsertMock).not.toHaveBeenCalled();
  });

  it('accepts a known non-draft status without error', async () => {
    const res = await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'valid-slug', title: 'Hi', contentMd: '# Hi', status: 'review' }),
    });
    expect(res.status).toBe(201);
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['status']).toBe('review');
  });
});

describe('POST / — tags filtering (Fix 3)', () => {
  beforeEach(() => {
    pgUpsertMock.mockReset();
    pgUpsertMock.mockResolvedValue(undefined);
    pgGetArticleBySlugMock.mockReset();
    pgGetArticleBySlugMock.mockResolvedValue(null);
  });

  it('filters out non-string elements from tags array', async () => {
    await buildApp().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'valid-slug', title: 'Hi', contentMd: '# Hi', tags: ['a', 5, 'b'] }),
    });
    expect(pgUpsertMock).toHaveBeenCalledTimes(1);
    const arg = pgUpsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['tags']).toEqual(['a', 'b']);
  });
});
