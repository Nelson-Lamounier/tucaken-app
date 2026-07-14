/**
 * @format
 * admin-api — Application funnel analytics + scheduled interviews.
 *
 * Routes (mounted under /api/admin/applications by the applications.ts facade,
 * BEFORE the core /:slug routes so literal paths are not captured as slugs):
 *   GET /analytics/funnel      — funnel computation + 2026 market framing
 *   GET /scheduled-interviews  — all scheduled stages, for the calendar
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { classifyRate, FUNNEL_RANGES } from '../../lib/market-funnel-ranges.js';
import { getPool, withUser } from '../../lib/pg.js';
import { computeFunnel } from '../../lib/repositories/funnel-analytics.js';
import { listScheduledInterviews } from '../../lib/repositories/interview-stages.js';
import type { AdminApiBindings } from '../../lib/types.js';

/** Default days of inactivity after which an in-flight stage is treated as ghosted. */
const DEFAULT_GHOST_DAYS = 21;

/** Resolve GHOST_DAYS from env, falling back to the default on missing/invalid values. */
function resolveGhostDays(): number {
  const raw = process.env['GHOST_DAYS'];
  if (!raw) return DEFAULT_GHOST_DAYS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GHOST_DAYS;
}

// ── Types ─────────────────────────────────────────────────────────────────────


export function createApplicationsAnalyticsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const app = new Hono<AdminApiBindings>();

  // ── GET /analytics/funnel — funnel computation + 2026 framing ─────────────
  app.get('/analytics/funnel', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);

    const ghostDays = resolveGhostDays();

    return withUser(getPool(config), userId, async (db) => {
      const { summary, transitions } = await computeFunnel(db, ghostDays);
      const framed = transitions.map((t) => {
        const { band, context } = classifyRate(t.key, t.rate);
        return { ...t, band, context };
      });
      return ctx.json({ summary, transitions: framed, ranges: FUNNEL_RANGES });
    });
  });

  // ── GET /scheduled-interviews — all scheduled stages, for the calendar ───
  /**
   * Lists every interview stage with a `scheduled_at` for the caller's own
   * applications (RLS-scoped), joined to company/role/status. Registered before
   * `/:slug` so the literal path is not captured as a slug.
   */
  app.get('/scheduled-interviews', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    return withUser(getPool(config), userId, async (db) => {
      const rows = await listScheduledInterviews(db);
      const interviews = rows.map(r => ({
        slug:        r.slug,
        company:     r.company,
        role:        r.role,
        status:      r.kanban_status,
        stage:       r.stage_type,
        stageStatus: r.stage_status,
        scheduledAt: r.scheduled_at,
      }));
      return ctx.json({ interviews, count: interviews.length });
    });
  });


  return app;
}
