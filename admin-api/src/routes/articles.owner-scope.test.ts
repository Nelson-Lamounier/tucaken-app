/** @format */
import { jest } from '@jest/globals';
import { Hono } from 'hono';

import type { Article } from '../lib/repositories/articles.js';

// ---------------------------------------------------------------------------
// Repository mocks — assert the owner-scoped functions receive the user id.
// ---------------------------------------------------------------------------
const listAllArticlesMock = jest.fn<(pool: unknown, authorId: string) => Promise<Article[]>>();
const listArticlesByStatusMock = jest.fn<(pool: unknown, status: string, authorId: string) => Promise<Article[]>>();
const getArticleBySlugForAuthorMock = jest.fn<(pool: unknown, slug: string, authorId: string) => Promise<Article | null>>();
const getArticleBySlugMock = jest.fn<(pool: unknown, slug: string) => Promise<Article | null>>();
const upsertArticleMock = jest.fn<() => Promise<void>>();
const deleteArticleMock = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('../lib/repositories/articles.js', () => ({
  listAllArticles: listAllArticlesMock,
  listArticlesByStatus: listArticlesByStatusMock,
  getArticleBySlugForAuthor: getArticleBySlugForAuthorMock,
  getArticleBySlug: getArticleBySlugMock,
  upsertArticle: upsertArticleMock,
  deleteArticle: deleteArticleMock,
}));

// getPool → dummy; withUser → run the callback with a dummy db (no real RLS).
jest.unstable_mockModule('../lib/pg.js', () => ({
  getPool: () => ({ query: jest.fn() }),
  withUser: async (_pool: unknown, _userId: string, cb: (db: unknown) => unknown) => cb({ query: jest.fn() }),
}));

jest.unstable_mockModule('../lib/portfolio-revalidate.js', () => ({
  revalidatePortfolioArticle: async () => ({ ok: true }),
}));

jest.unstable_mockModule('../middleware/auth.js', () => ({
  requireAdminGroup: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

const { createArticlesRouter } = await import('./articles.js');
const CONFIG = {} as never;

const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function article(overrides: Partial<Article> = {}): Article {
  return {
    slug: 'my-article', title: 'T', excerpt: null, contentMd: '# body', tags: [],
    status: 'draft', aiGenerated: false, aiModel: null, publishedAt: null,
    coverImage: null, destinations: ['portfolio'], authorId: OWNER, ...overrides,
  };
}

/** Router mounted behind a middleware that injects the signed-in user id. */
function appWithUser(userId: string | null): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (userId) c.set('userId' as never, userId as never);
    await next();
  });
  app.route('/', createArticlesRouter(CONFIG));
  return app;
}

beforeEach(() => { jest.clearAllMocks(); });

describe('article routes — owner scoping', () => {
  it('GET / returns 503 when the user is not provisioned', async () => {
    const res = await appWithUser(null).request('/');
    expect(res.status).toBe(503);
    expect(listAllArticlesMock).not.toHaveBeenCalled();
  });

  it('GET / scopes the list query to the signed-in user', async () => {
    listAllArticlesMock.mockResolvedValueOnce([article()]);
    const res = await appWithUser(OWNER).request('/');
    expect(res.status).toBe(200);
    expect(listAllArticlesMock).toHaveBeenCalledWith(expect.anything(), OWNER);
  });

  it('GET /?status=review scopes the status query to the signed-in user', async () => {
    listArticlesByStatusMock.mockResolvedValueOnce([]);
    const res = await appWithUser(OWNER).request('/?status=review');
    expect(res.status).toBe(200);
    expect(listArticlesByStatusMock).toHaveBeenCalledWith(expect.anything(), 'review', OWNER);
  });

  it("GET /:slug returns 404 for an article owned by another user", async () => {
    getArticleBySlugForAuthorMock.mockResolvedValueOnce(null); // not owned → null
    const res = await appWithUser(OWNER).request('/someone-elses-article');
    expect(res.status).toBe(404);
    expect(getArticleBySlugForAuthorMock).toHaveBeenCalledWith(expect.anything(), 'someone-elses-article', OWNER);
  });

  it('GET /:slug returns 200 for the owner', async () => {
    getArticleBySlugForAuthorMock.mockResolvedValueOnce(article());
    const res = await appWithUser(OWNER).request('/my-article');
    expect(res.status).toBe(200);
  });

  it("PUT /:slug returns 404 (no write) for another user's article", async () => {
    getArticleBySlugForAuthorMock.mockResolvedValueOnce(null);
    const res = await appWithUser(OWNER).request('/someone-elses-article', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'hijack' }),
    });
    expect(res.status).toBe(404);
    expect(upsertArticleMock).not.toHaveBeenCalled();
  });

  it("DELETE /:slug returns 404 (no delete) for another user's article", async () => {
    getArticleBySlugForAuthorMock.mockResolvedValueOnce(null);
    const res = await appWithUser(OWNER).request('/someone-elses-article', { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(deleteArticleMock).not.toHaveBeenCalled();
  });

  it('POST / returns 503 when the user is not provisioned (no null-owner insert)', async () => {
    const res = await appWithUser(null).request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-post', title: 'T', contentMd: '# x' }),
    });
    expect(res.status).toBe(503);
    expect(upsertArticleMock).not.toHaveBeenCalled();
  });

  it('POST / stamps the article with the signed-in user as author', async () => {
    getArticleBySlugMock.mockResolvedValueOnce(null); // slug free
    const res = await appWithUser(OWNER).request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-post', title: 'T', contentMd: '# x' }),
    });
    expect(res.status).toBe(201);
    expect(upsertArticleMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: 'new-post', authorId: OWNER }),
    );
  });

  // Regression (2026-07-06 live 500): the PUT merge dropped authorId, so the
  // upsert bound NULL — and since migration 105 made articles.author_id NOT
  // NULL, Postgres rejects the candidate insert tuple (23502) BEFORE the
  // ON CONFLICT COALESCE(articles.author_id, …) can preserve the owner. Every
  // metadata save, content save, and unpublish 500'd. The merged payload must
  // always carry the signed-in owner.
  it('PUT /:slug carries the signed-in owner into the upsert payload', async () => {
    getArticleBySlugForAuthorMock.mockResolvedValueOnce(article());
    const res = await appWithUser(OWNER).request('/my-article', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverImage: 'https://nelsonlamounier.com/articles/images/articles/cover.png' }),
    });
    expect(res.status).toBe(200);
    expect(upsertArticleMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        slug: 'my-article',
        coverImage: 'https://nelsonlamounier.com/articles/images/articles/cover.png',
        authorId: OWNER,
      }),
    );
  });
});
