/** @format */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { getPool, withUser } from '../../lib/pg.js';

interface RepoCompositionRow {
  repo: string;
  chunks: number;
  files: number;
}

interface TechnologyRow {
  name: string;
  ecosystem: string | null;
  occurrences: number;
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
      // Explicit user_id scoping (defense-in-depth): RLS is enabled but NOT
      // forced on these tables, so an owner/superuser DB role would bypass the
      // withUser RLS context. The explicit predicate guarantees tenant
      // isolation regardless of the connecting role.
      const { rows } = await db.query<RepoCompositionRow>(
        `SELECT repo_full_name AS repo,
                COUNT(*)::int            AS chunks,
                COUNT(DISTINCT file_path)::int AS files
           FROM document_embeddings
          WHERE user_id = $1::uuid
          GROUP BY repo_full_name
          ORDER BY chunks DESC`,
        [userId],
      );

      const totalChunks = rows.reduce((acc, r) => acc + r.chunks, 0);
      const totalFiles = rows.reduce((acc, r) => acc + r.files, 0);

      // Real technology signal lives in technology_evidence (deterministic
      // tech-extractor pipeline), NOT document_embeddings.technologies (dead
      // back-compat column). Surface the top technologies by evidence count.
      const { rows: techRows } = await db.query<TechnologyRow>(
        `SELECT raw_name AS name, ecosystem, COUNT(*)::int AS occurrences
           FROM technology_evidence
          WHERE user_id = $1::uuid
          GROUP BY raw_name, ecosystem
          ORDER BY occurrences DESC
          LIMIT 24`,
        [userId],
      );

      return ctx.json({
        kb: {
          totalChunks,
          totalFiles,
          repoCount: rows.length,
          repos: rows,
          technologies: techRows,
          technologyCount: techRows.length,
        },
      });
    });
  });

  return app;
}
