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

import { adminDisableUser, adminEnableUser } from '../lib/cognito-admin.js';
import type { AdminApiConfig } from '../lib/config.js';
import { logger } from '../lib/observability/logger.js';
import { getPool } from '../lib/pg.js';
import { purgeUser } from '../lib/purge-user.js';
import {
  adminUpdateUser,
  getAdminUserById,
  listUsers,
  restoreSoftDeletedUser,
  softDeleteUser,
} from '../lib/repositories/users.js';
import type { AdminApiBindings } from '../lib/types.js';
import { requireUserId } from '../lib/types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ListQuery = z.object({
  tier: z.enum(['all', 'free', 'pro', 'premium']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const DeleteBody = z.object({
  mode: z.enum(['soft', 'hard']),
  reason: z.string().max(500).optional(),
});

const PRIVILEGED_ROLES = new Set(['admin', 'super_admin']);

async function firstCognitoSub(
  pool: import('pg').Pool,
  userId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ cognito_sub: string }>(
    `SELECT cognito_sub FROM user_identities WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.cognito_sub ?? null;
}

async function handleSoftDelete(
  config: AdminApiConfig,
  pool: import('pg').Pool,
  userId: string,
  reason: string | null,
): Promise<{ ok: true; mode: 'soft'; alreadyDeleted: boolean }> {
  const sub = await firstCognitoSub(pool, userId);
  if (sub) await adminDisableUser(config.cognitoUserPoolId, config.awsRegion, sub);
  const deleted = await softDeleteUser(pool, userId, reason);
  logger.warn({ event: 'admin_user_soft_deleted', userId, reason }, 'admin soft-deleted user');
  return { ok: true, mode: 'soft', alreadyDeleted: !deleted };
}


export function createAdminUsersRouter(
  config: AdminApiConfig,
): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  /**
   * DELETE /api/admin/users/:userId
   *
   * Soft or hard delete for a user account.
   *   mode=soft — disables Cognito login + stamps deleted_at (30-day grace).
   *   mode=hard — purges Cognito, GitHub App, and DB rows immediately.
   *
   * Guards:
   *   400 — malformed UUID or bad body.
   *   401 — caller not authenticated.
   *   403 CannotDeleteSelf — caller is the target.
   *   403 CannotDeleteAdmin — target has a privileged role.
   *   404 — user not found.
   *   409 NoCognitoIdentity — hard delete but no cognito_sub row.
   */
  router.delete('/:userId', async (ctx) => {
    const userId = ctx.req.param('userId');
    if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400);

    const callerId = requireUserId(ctx);
    if (!callerId) return ctx.json({ error: 'Unauthenticated' }, 401);
    if (callerId === userId) return ctx.json({ error: 'CannotDeleteSelf' }, 403);

    let raw: unknown;
    try { raw = await ctx.req.json(); } catch { return ctx.json({ error: 'Invalid JSON body' }, 400); }
    const parsed = DeleteBody.safeParse(raw);
    if (!parsed.success) return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);

    const pool = getPool(config);
    const target = await getAdminUserById(pool, userId);
    if (!target) return ctx.json({ error: 'NotFound', userId }, 404);
    if (PRIVILEGED_ROLES.has(target.role)) return ctx.json({ error: 'CannotDeleteAdmin' }, 403);

    if (parsed.data.mode === 'soft') {
      return ctx.json(await handleSoftDelete(config, pool, userId, parsed.data.reason ?? null));
    }

    const sub = await firstCognitoSub(pool, userId);
    if (!sub) return ctx.json({ error: 'NoCognitoIdentity', userId }, 409);
    const outcome = await purgeUser(
      {
        pool,
        userPoolId: config.cognitoUserPoolId,
        region: config.awsRegion,
        githubAppId: config.githubAppId,
        githubPrivateKey: config.githubPrivateKey,
      },
      userId,
      sub,
    );
    logger.warn({ event: 'admin_user_hard_deleted', userId, outcome }, 'admin hard-deleted user');
    return ctx.json({ ok: true, mode: 'hard', outcome });
  });

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

  return router;
}
