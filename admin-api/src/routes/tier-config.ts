/**
 * @format
 * admin-api — Tier-config management routes.
 *
 * Routes:
 *
 *   GET  /api/admin/tier-config  — Return current tier config (cached, 60s TTL).
 *                                  Open to any authenticated user — feeds the
 *                                  public pricing catalogue and checkout flow.
 *
 *   PUT  /api/admin/tier-config  — Replace tier config. Admin-group only.
 *                                  Validates with TierConfigSchema (Zod), then
 *                                  upserts to PG and busts the in-process cache.
 */

import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { getPool } from '../lib/pg.js';
import { bustTierConfigCache, getCachedTierConfig } from '../lib/tier-config-cache.js';
import { upsertTierConfig } from '../lib/repositories/tier-config.js';
import { TierConfigSchema } from '../lib/tier-config-shape.js';
import { requireAdminGroup } from '../middleware/auth.js';
import type { AdminApiBindings } from '../lib/types.js';

/**
 * Create the tier-config admin router.
 *
 * @param config - Resolved application configuration.
 * @returns Hono router with GET and PUT handlers.
 */
export function createTierConfigRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  // -------------------------------------------------------------------------
  // GET / — any authenticated user
  // -------------------------------------------------------------------------
  router.get('/', async (ctx) => {
    const cfg = await getCachedTierConfig(getPool(config));
    return ctx.json(cfg);
  });

  // -------------------------------------------------------------------------
  // PUT / — admin-group only
  // -------------------------------------------------------------------------
  router.put('/', requireAdminGroup(), async (ctx) => {
    const body = await ctx.req.json<unknown>();
    const parsed = TierConfigSchema.safeParse(body);

    if (!parsed.success) {
      return ctx.json({ error: 'Invalid tier config', issues: parsed.error.issues }, 400);
    }

    const userId = ctx.get('userId');
    await upsertTierConfig(getPool(config), parsed.data, userId);
    bustTierConfigCache();
    return ctx.json({ updated: true });
  });

  return router;
}
