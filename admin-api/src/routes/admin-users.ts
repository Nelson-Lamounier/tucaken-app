/**
 * @format
 * /api/admin/users/* — staff-only user management.
 *
 * Currently exposes just one endpoint:
 *
 *   POST /api/admin/users/:userId/restore — Reverses a soft-deletion
 *   during the 30-day grace window. Calls AdminEnableUser on Cognito so
 *   the user can log in again, then clears users.deleted_at.
 *
 * Gated by `requireAdminGroup()` at mount-time (see index.ts), so callers
 * must be in the Cognito `admin` group. The `deletedUserGate` middleware
 * does NOT apply here (different path prefix) — that gate protects user-
 * facing routes, this is for ops.
 *
 * To find the Cognito sub for a soft-deleted user (the gate locks them
 * out of /me, but admin-api still has the row):
 *
 *   SELECT u.id, ui.cognito_sub, u.email, u.deleted_at
 *     FROM users u
 *     JOIN user_identities ui ON ui.user_id = u.id
 *    WHERE u.email = '<email>'
 *      AND u.deleted_at IS NOT NULL;
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { adminEnableUser } from '../lib/cognito-admin.js';
import type { AdminApiConfig } from '../lib/config.js';
import { logger } from '../lib/observability/logger.js';
import { getPool } from '../lib/pg.js';
import {
  adminUpdateUser,
  getAdminUserById,
  listUsers,
  restoreSoftDeletedUser,
} from '../lib/repositories/users.js';
import {
  getUserRepositories,
  getUserRepository,
  getUserDiagnostic,
} from '../lib/repositories/user-rag.js';
import type { AdminApiBindings } from '../lib/types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ListQuery = z.object({
  tier: z.enum(['all', 'free', 'pro', 'premium']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createAdminUsersRouter(
  config: AdminApiConfig,
): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  /**
   * POST /api/admin/users/:userId/restore
   *
   * Restores a soft-deleted user within the 30-day grace window:
   *   1. AdminEnableUser on Cognito (re-allows login)
   *   2. Clears users.deleted_at and users.deletion_reason
   *
   * Returns 404 if the user does not exist or is not soft-deleted.
   * Returns 200 with { restored: true } on success.
   *
   * Idempotent on the Cognito side (already-enabled users return silently)
   * but the DB step only matches WHERE deleted_at IS NOT NULL — so a
   * second call after success returns 404, NOT 200. Good signal: lets the
   * support tool detect double-clicks.
   */
  router.post('/:userId/restore', async (ctx) => {
    const userId = ctx.req.param('userId');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return ctx.json({ error: 'Invalid userId' }, 400);
    }

    const pool = getPool(config);

    // Find the Cognito sub so we can re-enable login. We use the first
    // identity row — users can have multiple (google + email + github)
    // but Cognito enables/disables at the user level, not per identity.
    const identity = await pool.query<{ cognito_sub: string }>(
      `SELECT cognito_sub
         FROM user_identities
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    );

    const restored = await restoreSoftDeletedUser(pool, userId);
    if (!restored) {
      return ctx.json(
        { error: 'NotFoundOrAlreadyActive', userId },
        404,
      );
    }

    // Restore Cognito login. If this throws AFTER the DB clear, the user
    // is technically restorable (deleted_at NULL) but can't log in until
    // an operator runs AdminEnableUser manually. Log loudly.
    const sub = identity.rows[0]?.cognito_sub;
    if (sub) {
      try {
        await adminEnableUser(
          config.cognitoUserPoolId,
          config.awsRegion,
          sub,
        );
      } catch (err) {
        logger.error(
          { event: 'cognito_enable_failed_after_restore', userId, sub, err },
          'restoreSoftDeletedUser succeeded but AdminEnableUser threw — manual cleanup required',
        );
        return ctx.json(
          {
            ok:      true,
            warning: 'DB restored but Cognito enable failed — run AdminEnableUser manually',
            sub,
          },
          200,
        );
      }
    }

    logger.warn(
      { event: 'account_restored', userId, sub },
      'soft-deleted account restored during grace window',
    );
    return ctx.json({ ok: true, restored: true });
  });

  /**
   * GET /api/admin/users
   *
   * Returns a paginated list of users. Accepts optional query params:
   *   - tier: 'all' | 'free' | 'pro' | 'premium' (default: 'all')
   *   - limit: 1–200 (default: 100)
   *   - offset: ≥ 0 (default: 0)
   */
  router.get('/', async (ctx) => {
    const parsed = ListQuery.safeParse({
      tier: ctx.req.query('tier'),
      limit: ctx.req.query('limit'),
      offset: ctx.req.query('offset'),
    });
    if (!parsed.success) {
      return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }
    const { rows, total } = await listUsers(getPool(config), parsed.data);
    return ctx.json({ users: rows, total });
  });

  /**
   * GET /api/admin/users/:userId
   *
   * Returns detail for a single user including Stripe fields and usage quotas.
   * Returns 400 for a malformed UUID, 404 if the user does not exist.
   */
  router.get('/:userId', async (ctx) => {
    const userId = ctx.req.param('userId');
    if (!UUID_RE.test(userId)) {
      return ctx.json({ error: 'Invalid userId' }, 400);
    }
    const user = await getAdminUserById(getPool(config), userId);
    if (!user) {
      return ctx.json({ error: 'NotFound', userId }, 404);
    }
    return ctx.json({ user });
  });

  /**
   * PATCH /api/admin/users/:userId
   *
   * Updates a user's role and/or plan inside a transaction.
   * Body: { role?: 'user' | 'admin', plan?: 'free' | 'pro' | 'premium' }
   * At least one field is required.
   * Returns { ok: true, updated: boolean }.
   */
  const UpdateBody = z.object({
    role: z.enum(['user', 'admin']).optional(),
    plan: z.enum(['free', 'pro', 'premium']).optional(),
  }).refine((b) => b.role !== undefined || b.plan !== undefined, {
    message: 'At least one of role or plan is required',
  });

  router.patch('/:userId', async (ctx) => {
    const userId = ctx.req.param('userId');
    if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400);

    let raw: unknown;
    try { raw = await ctx.req.json(); } catch { return ctx.json({ error: 'Invalid JSON body' }, 400); }
    const parsed = UpdateBody.safeParse(raw);
    if (!parsed.success) return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);

    const { role, plan } = parsed.data;
    const patch: { role?: 'user' | 'admin'; plan?: 'free' | 'pro' | 'premium' } = {};
    if (role !== undefined) patch.role = role;
    if (plan !== undefined) patch.plan = plan;

    const pool = getPool(config);
    const client = await pool.connect();
    let updated = false;
    try {
      await client.query('BEGIN');
      updated = await adminUpdateUser(client, userId, patch);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    logger.warn({ event: 'admin_user_updated', userId, patch: parsed.data, updated }, 'admin updated user');
    return ctx.json({ ok: true, updated });
  });

  /**
   * GET /api/admin/users/:userId/repositories
   *
   * A user's synced repositories with their RAG metrics (KB-quality + retrieval
   * scores and breakdowns). Admin support-tool surface — read-only.
   */
  router.get('/:userId/repositories', async (ctx) => {
    const userId = ctx.req.param('userId');
    if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400);
    const repositories = await getUserRepositories(getPool(config), userId);
    return ctx.json({ repositories });
  });

  /**
   * GET /api/admin/users/:userId/repositories/:repo
   *
   * Single repo's RAG detail (kb_quality + retrieval scores + breakdowns).
   * `:repo` is the URL-encoded repo_full_name (owner%2Fname).
   */
  router.get('/:userId/repositories/:repo', async (ctx) => {
    const userId = ctx.req.param('userId');
    if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400);
    const repoFullName = decodeURIComponent(ctx.req.param('repo'));
    const repository = await getUserRepository(getPool(config), userId, repoFullName);
    if (!repository) return ctx.json({ error: 'NotFound', repo: repoFullName }, 404);
    return ctx.json({ repository });
  });

  /**
   * GET /api/admin/users/:userId/diagnostic
   *
   * The full Resume-Readiness diagnostic for an arbitrary user (the user-facing
   * /profile/summary only returns the caller's own rollup). Admin keeps the
   * complete readiness panel — overall score + all five sub-metrics + blockers.
   */
  router.get('/:userId/diagnostic', async (ctx) => {
    const userId = ctx.req.param('userId');
    if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400);
    const result = await getUserDiagnostic(getPool(config), userId);
    if (!result) return ctx.json({ error: 'No profile yet', userId }, 404);
    return ctx.json(result);
  });

  return router;
}
