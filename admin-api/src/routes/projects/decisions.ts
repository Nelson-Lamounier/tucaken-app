/**
 * @format
 * admin-api — Project decision-record routes.
 *
 * Routes (mounted under /api/admin/projects by the projects.ts facade):
 *   GET    /:id/decisions       — list decisions
 *   PATCH  /:id/decisions/:did  — edit / confirm a decision
 *   DELETE /:id/decisions/:did  — remove a decision
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { getPool, withUser } from '../../lib/pg.js';
import { invalidateProject } from '../../lib/redis-cache.js';
import { deleteDecision, getProjectDetail, patchDecision } from '../../lib/repositories/projects.js';
import { AdminApiBindings, requireUserId } from '../../lib/types.js';
import { VALID_CONFIDENCE, isUuid, isValidOption, nullableString } from './projects-shared.js';

export function createProjectsDecisionsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    router.onError((err, ctx) => {
        const status = (err as { status?: number }).status ?? 500;
        console.error(`[projects] ${ctx.req.method} ${ctx.req.path}`, err.message);
        return ctx.json({ error: err.message }, status as 400 | 401 | 403 | 404 | 500);
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /:id/decisions                    — list
    // ────────────────────────────────────────────────────────────────────
    router.get('/:id/decisions', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);
        const detail = await withUser(pool, uid, async (db) => getProjectDetail(db, id));
        if (!detail) return ctx.json({ error: 'Not found' }, 404);
        return ctx.json({ items: detail.decisions });
    });

    // ────────────────────────────────────────────────────────────────────
    // PATCH /:id/decisions/:did             — edit / confirm
    // ────────────────────────────────────────────────────────────────────
    router.patch('/:id/decisions/:did', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id  = ctx.req.param('id');
        const did = ctx.req.param('did');
        if (!isUuid(id))  return ctx.json({ error: 'invalid project id' }, 400);
        if (!isUuid(did)) return ctx.json({ error: 'invalid decision id' }, 400);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;
        if (input.confidence !== undefined && !isValidOption(VALID_CONFIDENCE, input.confidence)) {
            return ctx.json({ error: 'invalid confidence' }, 400);
        }

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            patchDecision(db, id, did, {
                title:             typeof input.title             === 'string'  ? input.title             : undefined,
                context:           nullableString(input.context),
                decision:          nullableString(input.decision),
                consequences:      nullableString(input.consequences),
                confidence:        typeof input.confidence        === 'string'  ? input.confidence        : undefined,
                is_user_confirmed: typeof input.is_user_confirmed === 'boolean' ? input.is_user_confirmed : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
        void invalidateProject(id);
        return ctx.json({ updated: result.updated });
    });

    // ────────────────────────────────────────────────────────────────────
    // DELETE /:id/decisions/:did            — remove
    // ────────────────────────────────────────────────────────────────────
    router.delete('/:id/decisions/:did', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id  = ctx.req.param('id');
        const did = ctx.req.param('did');
        if (!isUuid(id))  return ctx.json({ error: 'invalid project id' }, 400);
        if (!isUuid(did)) return ctx.json({ error: 'invalid decision id' }, 400);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) => deleteDecision(db, id, did));
        if (result.deleted === 0) return ctx.json({ error: 'Not found' }, 404);
        void invalidateProject(id);
        return ctx.json({ deleted: result.deleted });
    });


    return router;
}
