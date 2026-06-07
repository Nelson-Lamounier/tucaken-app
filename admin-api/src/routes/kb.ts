/** @format */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import type { AdminApiBindings } from '../lib/types.js';
import { getPool, withUser } from '../lib/pg.js';

interface RepoCompositionRow {
  repo: string;
  chunks: number;
  files: number;
}

/**
 * Knowledge-base health router. Surfaces the composition of the authenticated
 * user's pgvector store (`document_embeddings`) so the UI can show "data health
 * at a glance". RLS-scoped via withUser — no explicit user_id filter needed.
 */
export function createKbRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const app = new Hono<AdminApiBindings>();

  // ── GET /health — KB composition (chunks/files per repo) ──────────────────
  app.get('/health', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);

    return withUser(getPool(config), userId, async (db) => {
      const { rows } = await db.query<RepoCompositionRow>(
        `SELECT repo_full_name AS repo,
                COUNT(*)::int            AS chunks,
                COUNT(DISTINCT file_path)::int AS files
           FROM document_embeddings
          GROUP BY repo_full_name
          ORDER BY chunks DESC`,
      );

      const totalChunks = rows.reduce((acc, r) => acc + r.chunks, 0);
      const totalFiles = rows.reduce((acc, r) => acc + r.files, 0);

      return ctx.json({
        kb: {
          totalChunks,
          totalFiles,
          repoCount: rows.length,
          repos: rows,
        },
      });
    });
  });

  return app;
}
