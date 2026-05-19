/**
 * @format
 * admin-api — User profile summary route.
 *
 * Routes:
 *   GET /summary — return the aggregated rollup, mirror, reveal, and timestamps
 *                  for the authenticated user's profile.
 *
 * RLS: every query is scoped to user_id = $1::uuid (users.id UUID) derived
 * from the requireUserId middleware helper.
 */

import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { getPool } from '../lib/pg.js';
import { AdminApiBindings, requireUserId } from '../lib/types.js';

export function createProfileRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    // -------------------------------------------------------------------------
    // Error boundary — consistent JSON error shape
    // -------------------------------------------------------------------------
    router.onError((err, ctx) => {
        const status = (err as { status?: number }).status ?? 500;
        console.error(`[profile] ${ctx.req.method} ${ctx.req.path}`, err.message);
        return ctx.json({ error: err.message }, status as 400 | 401 | 403 | 404 | 500 | 502 | 503);
    });

    // -------------------------------------------------------------------------
    // GET /summary — aggregated profile data
    // -------------------------------------------------------------------------
    router.get('/summary', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const { rows } = await pool.query(
            `SELECT rollup, mirror, reveal, refreshed_at, synthesis_refreshed_at
               FROM user_profile_rollup WHERE user_id = $1::uuid`,
            [uid],
        );

        const r = rows[0];
        if (!r) return ctx.json({ error: 'No profile yet' }, 404);

        return ctx.json({
            rollup:               r.rollup,
            mirror:               r.mirror ?? null,
            reveal:               r.reveal ?? null,
            refreshedAt:          r.refreshed_at ? r.refreshed_at.toISOString() : null,
            synthesisRefreshedAt: r.synthesis_refreshed_at ? r.synthesis_refreshed_at.toISOString() : null,
        });
    });

    return router;
}
