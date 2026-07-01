import { Hono } from 'hono';
import { z } from 'zod';

import type { AdminApiConfig } from '../lib/config.js';
import { logger } from '../lib/observability/logger.js';
import { getPool } from '../lib/pg.js';
import { getChatbotEnabled, setChatbotEnabled } from '../lib/repositories/users.js';
import type { AdminApiBindings } from '../lib/types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ chatbotEnabled: z.boolean() });

/**
 * Admin-only chatbot settings. Owner-scoped: the chatbot serves the portfolio
 * owner (PORTFOLIO_OWNER_USER_ID) and the ingestion gate runs AS the owner, so
 * the flag is read/written on the owner's `users` row — NOT the admin caller's.
 * Admin-group enforcement is applied at the mount in index.ts.
 */
export function createAdminSettingsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  const ownerId = (): string | null => {
    const id = process.env['PORTFOLIO_OWNER_USER_ID'];
    return id && UUID_RE.test(id) ? id : null;
  };

  router.get('/chatbot', async (ctx) => {
    const owner = ownerId();
    if (!owner) return ctx.json({ error: 'PORTFOLIO_OWNER_USER_ID not configured' }, 500);

    const client = await getPool(config).connect();
    try {
      const chatbotEnabled = await getChatbotEnabled(client, owner);
      return ctx.json({ chatbotEnabled });
    } finally {
      client.release();
    }
  });

  router.patch('/chatbot', async (ctx) => {
    const owner = ownerId();
    if (!owner) return ctx.json({ error: 'PORTFOLIO_OWNER_USER_ID not configured' }, 500);

    let raw: unknown;
    try { raw = await ctx.req.json(); } catch { return ctx.json({ error: 'Invalid JSON body' }, 400); }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);

    const client = await getPool(config).connect();
    let updated = false;
    try {
      await client.query('BEGIN');
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
