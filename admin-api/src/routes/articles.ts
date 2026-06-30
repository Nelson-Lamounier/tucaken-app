/**
 * @format
 * admin-api — Article management routes (PG-only).
 *
 * Routes (all protected by Cognito JWT middleware applied at the router level):
 *
 *   GET    /api/admin/articles               — List articles, optionally filtered by status.
 *                                              ?status=all|draft|review|published|rejected
 *                                              Default: all
 *   GET    /api/admin/articles/:slug         — Get article by slug
 *   GET    /api/admin/articles/:slug/versions — List pipeline_runs version history for a slug
 *   PUT    /api/admin/articles/:slug         — Update article metadata (PG upsert)
 *   DELETE /api/admin/articles/:slug         — Delete article from PG
 *   POST   /api/admin/articles/:slug/publish — Flip status to 'published' in PG
 *
 * BFF note:
 *   This BFF is the sole write path for the tucaken-app TanStack application.
 *   The public-api service exposes the corresponding read-only endpoints for
 *   portfolio visitors — these admin routes must never be exposed publicly.
 */

import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { getPool, withUser } from '../lib/pg.js';
import { requireAdminGroup } from '../middleware/auth.js';
import {
    upsertArticle,
    deleteArticle as pgDeleteArticle,
    getArticleBySlug,
    listArticlesByStatus,
    listAllArticles,
} from '../lib/repositories/articles.js';
import type { AdminApiBindings } from '../lib/types.js';

/**
 * Create the articles admin router.
 *
 * @param config - Resolved application configuration.
 * @returns Hono router with article management routes.
 */
export function createArticlesRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  router.use('*', requireAdminGroup());

  /** Valid article statuses. */
  const ALL_STATUSES = ['draft', 'processing', 'review', 'published', 'rejected', 'flagged'] as const;
  const ALL_STATUS_SET = new Set<string>(ALL_STATUSES);

  /** Slug format: lowercase alphanumeric + hyphens, no leading/trailing hyphen. */
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

  /** Destinations that may be written to the articles table. */
  const ALLOWED_DESTINATIONS = new Set(['portfolio', 'tucaken']);

  // -----------------------------------------------------------------------
  // GET /api/admin/articles/slug-available — registered before /:slug
  // -----------------------------------------------------------------------
  router.get('/slug-available', async (ctx) => {
    const slug = ctx.req.query('slug') ?? '';
    if (!SLUG_RE.test(slug)) return ctx.json({ available: false }, 200);
    const existing = await getArticleBySlug(getPool(config), slug);
    return ctx.json({ available: existing === null });
  });

  // -----------------------------------------------------------------------
  // POST /api/admin/articles — create article
  // -----------------------------------------------------------------------
  router.post('/', async (ctx) => {
    const body = await ctx.req.json<Record<string, unknown>>();
    const slug = typeof body['slug'] === 'string' ? body['slug'] : '';
    const title = typeof body['title'] === 'string' ? body['title'] : '';
    const contentMd = typeof body['contentMd'] === 'string' ? body['contentMd'] : '';

    if (!SLUG_RE.test(slug)) return ctx.json({ error: 'Invalid slug' }, 400);
    if (!title || !contentMd) return ctx.json({ error: 'title and contentMd are required' }, 400);

    const rawDest = Array.isArray(body['destinations']) ? (body['destinations'] as unknown[]) : [];
    const destinations = rawDest.filter(
      (d): d is string => typeof d === 'string' && ALLOWED_DESTINATIONS.has(d),
    );
    const finalDestinations = destinations.length > 0 ? destinations : ['portfolio'];

    const pool = getPool(config);
    const existing = await getArticleBySlug(pool, slug);
    if (existing) return ctx.json({ error: 'An article with this slug already exists' }, 409);

    const status = typeof body['status'] === 'string' ? body['status'] : 'draft';
    if (status !== 'draft' && !ALL_STATUS_SET.has(status)) {
      return ctx.json({ error: 'Invalid status' }, 400);
    }


    const rawTags = Array.isArray(body['tags']) ? (body['tags'] as unknown[]) : [];

    await upsertArticle(pool, {
      slug,
      title,
      excerpt: typeof body['excerpt'] === 'string' ? body['excerpt'] : null,
      contentMd,
      tags: rawTags.filter((t): t is string => typeof t === 'string'),
      status,
      aiGenerated: false,
      aiModel: null,
      publishedAt: status === 'published' ? new Date() : null,
      coverImage: typeof body['coverImage'] === 'string' ? body['coverImage'] : null,
      destinations: finalDestinations,
      authorId: ctx.get('userId') ?? null,
    });

    return ctx.json({ created: true, slug }, 201);
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/articles
  // -----------------------------------------------------------------------
  router.get('/', async (ctx) => {
    const rawStatus = (ctx.req.query('status') ?? 'all').toLowerCase();
    const pool = getPool(config);

    let articles: import('../lib/repositories/articles.js').Article[];

    if (rawStatus === 'all') {
        articles = await listAllArticles(pool);
    } else if (ALL_STATUS_SET.has(rawStatus)) {
        articles = await listArticlesByStatus(pool, rawStatus);
    } else {
        return ctx.json({ error: `Invalid status "${rawStatus}". Must be one of: all, ${ALL_STATUSES.join(', ')}` }, 400);
    }

    return ctx.json({ articles, count: articles.length });
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/articles/:slug
  // -----------------------------------------------------------------------
  router.get('/:slug', async (ctx) => {
    const slug = ctx.req.param('slug');
    const article = await getArticleBySlug(getPool(config), slug);
    if (!article) return ctx.json({ error: 'Article not found' }, 404);
    return ctx.json({ article });
  });

  // -----------------------------------------------------------------------
  // PUT /api/admin/articles/:slug — PG-only upsert
  // -----------------------------------------------------------------------
  router.put('/:slug', async (ctx) => {
    const slug = ctx.req.param('slug');
    const body = await ctx.req.json<Record<string, unknown>>();

    const allowedFields = [
      'title', 'excerpt', 'tags', 'status', 'coverImage',
      'author', 'category', 'publishedAt', 'seo',
      'contentMd', 'aiGenerated', 'aiModel', 'destinations',
    ];
    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowedFields.includes(k)),
    );

    if (Object.keys(updates).length === 0) {
      return ctx.json({ error: 'No valid fields to update' }, 400);
    }

    const pool = getPool(config);
    const existing = await getArticleBySlug(pool, slug);
    if (!existing) return ctx.json({ error: 'Article not found' }, 404);

    const rawDest = Array.isArray(updates['destinations']) ? (updates['destinations'] as unknown[]) : [];
    const filteredDest = rawDest.filter((d): d is string => typeof d === 'string' && ALLOWED_DESTINATIONS.has(d));

    const merged: import('../lib/repositories/articles.js').Article = {
        slug,
        title:       'title'       in updates ? (updates['title']       as string)              : existing.title,
        excerpt:     'excerpt'     in updates ? (updates['excerpt']     as string | null)       : existing.excerpt,
        contentMd:   'contentMd'   in updates ? (updates['contentMd']   as string)              : existing.contentMd,
        tags:        'tags'        in updates ? (updates['tags']        as string[])            : existing.tags,
        status:      'status'      in updates ? (updates['status']      as string)              : existing.status,
        aiGenerated: 'aiGenerated' in updates ? (updates['aiGenerated'] as boolean)             : existing.aiGenerated,
        aiModel:     'aiModel'     in updates ? (updates['aiModel']     as string | null)       : existing.aiModel,
        publishedAt: 'publishedAt' in updates
            ? (updates['publishedAt'] ? new Date(updates['publishedAt'] as string) : null)
            : existing.publishedAt,
        coverImage:   'coverImage'   in updates ? (updates['coverImage']   as string | null) : existing.coverImage,
        destinations: 'destinations' in updates ? (filteredDest.length > 0 ? filteredDest : existing.destinations) : existing.destinations,
    };

    await upsertArticle(pool, merged);
    return ctx.json({ updated: true, slug });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/admin/articles/:slug — PG-only
  // -----------------------------------------------------------------------
  router.delete('/:slug', async (ctx) => {
    const slug = ctx.req.param('slug');
    await pgDeleteArticle(getPool(config), slug);
    return ctx.json({ deleted: true, slug });
  });

  // -----------------------------------------------------------------------
  // POST /api/admin/articles/:slug/publish — PG status flip
  // -----------------------------------------------------------------------
  router.post('/:slug/publish', async (ctx) => {
    const slug = ctx.req.param('slug');
    const pool = getPool(config);

    const existing = await getArticleBySlug(pool, slug);
    if (!existing) return ctx.json({ error: 'Article not found' }, 404);

    await pool.query(
        `UPDATE articles SET status = 'published', published_at = COALESCE(published_at, NOW()), updated_at = NOW() WHERE slug = $1`,
        [slug],
    );
    return ctx.json({ published: true, slug });
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/articles/:slug/versions — read pipeline_runs history
  // -----------------------------------------------------------------------
  router.get('/:slug/versions', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');
    const limitParam = ctx.req.query('limit');
    const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10), 50) : 20;

    return withUser(getPool(config), userId, async (db) => {
      const result = await db.query<{
          id: string; status: string; metadata: Record<string, unknown> | null;
          error_message: string | null; created_at: Date; updated_at: Date;
      }>(
          `SELECT id, status, metadata, error_message, created_at, updated_at
           FROM pipeline_runs
           WHERE pipeline_type = 'article' AND reference_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [slug, limit],
      );

      const versions = result.rows.map((r) => ({
          pipelineRunId: r.id,
          status:        r.status,
          metadata:      r.metadata,
          errorMessage:  r.error_message,
          createdAt:     r.created_at,
          updatedAt:     r.updated_at,
      }));

      return ctx.json({
          success:       true,
          slug,
          totalVersions: versions.length,
          versions,
      });
    });
  });

  return router;
}
