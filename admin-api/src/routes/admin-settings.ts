import { Hono } from 'hono';
import { z } from 'zod';

import type { AdminApiConfig } from '../lib/config.js';
import { logger } from '../lib/observability/logger.js';
import { getPool } from '../lib/pg.js';
import { getChatbotEnabled, getPortfolioOwnerId, setChatbotEnabled } from '../lib/repositories/users.js';
import type { AdminApiBindings } from '../lib/types.js';

const Body = z.object({ chatbotEnabled: z.boolean() });

/**
 * Admin-only chatbot settings. Owner-scoped: the chatbot serves the portfolio
 * owner and the ingestion gate runs AS the owner, so the flag is read/written on
 * the owner's `users` row — NOT the admin caller's. The owner is resolved from
 * the DB (users.is_portfolio_owner, migration 113), the canonical source — no
 * PORTFOLIO_OWNER_USER_ID env needed. Admin-group enforcement is at the mount.
 */
export function createAdminSettingsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  router.get('/chatbot', async (ctx) => {
    const client = await getPool(config).connect();
    try {
      const owner = await getPortfolioOwnerId(client);
      if (!owner) return ctx.json({ error: 'No portfolio owner configured' }, 500);
      const chatbotEnabled = await getChatbotEnabled(client, owner);
      return ctx.json({ chatbotEnabled });
    } finally {
      client.release();
    }
  });

  router.patch('/chatbot', async (ctx) => {
    let raw: unknown;
    try { raw = await ctx.req.json(); } catch { return ctx.json({ error: 'Invalid JSON body' }, 400); }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);

    const client = await getPool(config).connect();
    let updated = false;
    try {
      await client.query('BEGIN');
      const owner = await getPortfolioOwnerId(client);
      if (!owner) {
        await client.query('ROLLBACK');
        return ctx.json({ error: 'No portfolio owner configured' }, 500);
      }
      updated = await setChatbotEnabled(client, owner, parsed.data.chatbotEnabled);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    logger.warn(
      { event: 'chatbot_setting_updated', enabled: parsed.data.chatbotEnabled, updated },
      'admin updated chatbot setting',
    );
    return ctx.json({ ok: true, updated });
  });

  return router;
}
