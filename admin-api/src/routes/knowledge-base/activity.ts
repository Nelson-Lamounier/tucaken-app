/**
 * @format
 * admin-api — User activity route (user-authed, not staff-gated).
 *
 * Routes:
 *   GET /daily?days=30 — applications + resumes the authenticated user generated
 *                        per day over the trailing window (dense, zero-filled).
 *
 * Mounted under /api/admin/activity, so it inherits the Cognito JWT guard +
 * user provisioning, but NOT requireAdminGroup — every query is scoped to the
 * caller's own user_id via requireUserId (same pattern as /profile/summary).
 */
import { Hono } from 'hono';
import { z } from 'zod';

import type { AdminApiConfig } from '../../lib/config.js';
import { getPool } from '../../lib/pg.js';
import { getDailyActivity, getUserRepositories, summariseKbHealth } from '../../lib/repositories/user-rag.js';
import { AdminApiBindings, requireUserId } from '../../lib/types.js';

const DaysQuery = z.object({
    days: z.coerce.number().int().min(1).max(90).default(30),
});

export function createActivityRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    router.onError((err, ctx) => {
        const status = (err as { status?: number }).status ?? 500;
        console.error(`[activity] ${ctx.req.method} ${ctx.req.path}`, err.message);
        return ctx.json({ error: err.message }, status as 400 | 401 | 403 | 404 | 500 | 502 | 503);
    });

    // -------------------------------------------------------------------------
    // GET /daily — per-day application + resume counts for the caller
    // -------------------------------------------------------------------------
    router.get('/daily', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const parsed = DaysQuery.safeParse({ days: ctx.req.query('days') });
        if (!parsed.success) return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);

        const todayUtc = new Date().toISOString().slice(0, 10);
        const series = await getDailyActivity(getPool(config), uid, parsed.data.days, todayUtc);
        return ctx.json(series);
    });

    // -------------------------------------------------------------------------
    // GET /kb-health — the caller's own repositories' KB quality at a glance
    // (chunks + files processed during ingestion, per repo + aggregate totals).
    // -------------------------------------------------------------------------
    router.get('/kb-health', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const repositories = await getUserRepositories(getPool(config), uid);
        return ctx.json(summariseKbHealth(repositories));
    });

    return router;
}
