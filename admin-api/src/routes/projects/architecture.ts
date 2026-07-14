/**
 * @format
 * admin-api — Project architecture routes.
 *
 * Routes (mounted under /api/admin/projects by the projects.ts facade):
 *   GET   /:id/architecture — Mermaid source
 *   PATCH /:id/architecture — user edits (sets is_user_edited=true)
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { getPool, withUser } from '../../lib/pg.js';
import { invalidateProject } from '../../lib/redis-cache.js';
import { getProjectDetail, patchArchitecture } from '../../lib/repositories/projects.js';
import { AdminApiBindings, requireUserId } from '../../lib/types.js';
import { isUuid } from './projects-shared.js';

export function createProjectsArchitectureRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    router.onError((err, ctx) => {
        const status = (err as { status?: number }).status ?? 500;
        console.error(`[projects] ${ctx.req.method} ${ctx.req.path}`, err.message);
        return ctx.json({ error: err.message }, status as 400 | 401 | 403 | 404 | 500);
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /:id/architecture                 — Mermaid source
    // ────────────────────────────────────────────────────────────────────
    router.get('/:id/architecture', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);
        const detail = await withUser(pool, uid, async (db) => getProjectDetail(db, id));
        if (!detail) return ctx.json({ error: 'Not found' }, 404);
        if (!detail.architecture) return ctx.json({ error: 'No architecture diagram yet' }, 404);
        return ctx.json(detail.architecture);
    });

    // ────────────────────────────────────────────────────────────────────
    // PATCH /:id/architecture               — user edits (sticky)
    // ────────────────────────────────────────────────────────────────────
    router.patch('/:id/architecture', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;
        const format = input.diagram_format;
        if (format !== undefined && format !== 'mermaid' && format !== 'svg') {
            return ctx.json({ error: 'diagram_format must be mermaid or svg' }, 400);
        }
        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            patchArchitecture(db, id, {
                diagram_format: format,
                diagram_source: typeof input.diagram_source === 'string' ? input.diagram_source : undefined,
                nodes:          Array.isArray(input.nodes) ? input.nodes : undefined,
                edges:          Array.isArray(input.edges) ? input.edges : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
        void invalidateProject(id);
        return ctx.json({ updated: result.updated });
    });


    return router;
}
