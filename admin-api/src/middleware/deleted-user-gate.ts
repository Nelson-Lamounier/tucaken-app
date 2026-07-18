/**
 * @format
 * admin-api — Deleted-user gate.
 *
 * Runs AFTER `userProvisionMiddleware` for every /api/admin/* request and
 * returns 410 Gone if the user is soft-deleted (within the 30-day grace
 * window). The Cognito side is already disabled via AdminDisableUser, so a
 * user reaching this point either has a still-valid JWT issued before the
 * deletion, or has called this admin-api directly with a leaked token.
 * Either way, we refuse.
 *
 * Carve-out: GET `/api/admin/me` and POST `/api/admin/me/delete` stay
 * reachable so the frontend can surface "your account is being deleted"
 * messaging and the user can re-submit the delete request (idempotent —
 * keeps the grace clock anchored to the FIRST request).
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Pool } from 'pg';

import { logger } from '../lib/observability/logger.js';
import type { AdminApiBindings } from '../lib/types.js';

/** Cache so we don't re-read users.deleted_at on every request. */
const deletedAtCache = new Map<
  string,
  { deletedAt: Date | null; cachedUntil: number }
>();
const CACHE_TTL_MS = 30_000;

const ALLOWED_PATH_PREFIXES = ['/api/admin/me'];

/**
 * Exact segment match: `/api/admin/me` and `/api/admin/me/...` pass, but a
 * future sibling like `/api/admin/metrics` must NOT — a bare startsWith on
 * the prefix would silently exempt any route whose name begins with "me".
 */
function isAllowedPath(path: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function deletedUserGate(pool: Pool): MiddlewareHandler<AdminApiBindings> {
  return async (
    ctx: Context<AdminApiBindings>,
    next: Next,
  ): Promise<void> => {
    const userId = ctx.get('userId');
    if (!userId) {
      // No userId means user-provision didn't set one — the gate has nothing
      // to do. The route handler will respond with 503 if it requires a user.
      await next();
      return;
    }

    const path = ctx.req.path;
    if (isAllowedPath(path)) {
      await next();
      return;
    }

    const now = Date.now();
    const cached = deletedAtCache.get(userId);
    let deletedAt = cached?.deletedAt ?? null;
    if (!cached || cached.cachedUntil < now) {
      const result = await pool.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM users WHERE id = $1`,
        [userId],
      );
      deletedAt = result.rows[0]?.deleted_at ?? null;
      deletedAtCache.set(userId, {
        deletedAt,
        cachedUntil: now + CACHE_TTL_MS,
      });
    }

    if (deletedAt) {
      logger.info(
        {
          event:     'deleted_user_blocked',
          userId,
          path,
          deletedAt: deletedAt.toISOString(),
        },
        'admin-api request from soft-deleted user blocked with 410 Gone',
      );
      ctx.res = new Response(
        JSON.stringify({
          error:     'AccountDeleted',
          message:   'This account has been deleted.',
          deletedAt: deletedAt.toISOString(),
        }),
        { status: 410, headers: { 'Content-Type': 'application/json' } },
      );
      return;
    }

    await next();
  };
}

/**
 * Test/ops helper — bust the in-process cache (e.g. after a support tool
 * restores a user). Not normally needed; the TTL expires within 30 s anyway.
 */
export function _resetDeletedUserCache(): void {
  deletedAtCache.clear();
}
