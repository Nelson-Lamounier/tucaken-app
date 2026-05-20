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

import { adminEnableUser } from '../lib/cognito-admin.js';
import type { AdminApiConfig } from '../lib/config.js';
import { logger } from '../lib/observability/logger.js';
import { getPool } from '../lib/pg.js';
import { restoreSoftDeletedUser } from '../lib/repositories/users.js';
import type { AdminApiBindings } from '../lib/types.js';

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

  return router;
}
