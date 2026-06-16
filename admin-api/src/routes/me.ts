/**
 * @format
 * /api/admin/me — current user profile + plan status.
 *
 * Called by the frontend once after login to trigger user provisioning and
 * hydrate the UI with profile and plan data. Safe to call on every page load —
 * userProvisionMiddleware makes the upsert idempotent.
 */
import { Hono } from 'hono';

import { adminDisableUser } from '../lib/cognito-admin.js';
import type { AdminApiConfig } from '../lib/config.js';
import { revokeGitHubInstallationForUser } from '../lib/github-uninstall.js';
import { logger } from '../lib/observability/logger.js';
import { getPool } from '../lib/pg.js';
import { getUserPlanStatus, softDeleteUser } from '../lib/repositories/users.js';
import type { AdminApiBindings } from '../lib/types.js';

export function createMeRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  /**
   * GET /api/admin/me
   *
   * Returns the authenticated user's profile and plan status.
   * The act of calling this endpoint triggers userProvisionMiddleware,
   * which creates the users row on first sign-in.
   */
  router.get('/', async (ctx) => {
    const userId    = ctx.get('userId');
    const isNewUser = ctx.get('isNewUser') ?? false;
    const payload   = ctx.get('jwtPayload');

    if (!userId) {
      logger.warn(
        { event: 'user_provision_missing', route: '/api/admin/me' },
        'userId absent on context — userProvisionMiddleware failed; returning 503',
      );
      return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);
    }

    // Query users directly on the superuser pool — no RLS needed here.
    // tucaken_app role may not have SELECT on users; this is a scoped
    // read already protected by the userId from auth middleware.
    const plan = await getUserPlanStatus(getPool(config), userId);

    return ctx.json({
      id:        userId,
      email:     payload['email']   as string,
      name:      payload['name']    as string | undefined,
      avatarUrl: payload['picture'] as string | undefined,
      isNew:     isNewUser,
      plan:      plan ?? {
        plan:                 'free',
        effectivePlan:        'free',
        role:                 'user',
        trialStartedAt:       null,
        trialEndsAt:          null,
        trialDaysRemaining:   null,
        subscriptionStatus:   null,
        stripeCustomerId:     null,
        stripeSubscriptionId: null,
        cancelAtPeriodEnd:    false,
        currentPeriodEnd:     null,
      },
    });
  });

  /**
   * POST /api/admin/me/delete
   *
   * Initiates account termination. Caller (tucaken-app deleteAccountFn) has
   * already cancelled the Stripe subscription and disabled the Cognito user;
   * this endpoint is the DB side of the transaction.
   *
   * Idempotent — calling twice keeps the original `deleted_at` timestamp so
   * the 30-day grace clock does not restart.
   *
   * Body: { reason?: string }   (free-text, max 1000 chars)
   * Returns: { ok: true, deletedAt: ISO8601 }
   */
  router.post('/delete', async (ctx) => {
    const userId  = ctx.get('userId');
    const payload = ctx.get('jwtPayload');
    if (!userId) return ctx.json({ error: 'Not provisioned' }, 503);

    let body: { reason?: unknown } = {};
    try {
      body = await ctx.req.json();
    } catch {
      // No body is acceptable — reason is optional.
    }
    const reason =
      typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null;

    // Disable Cognito login BEFORE the DB write. If this throws, the DB
    // stays clean and the caller can retry. If the DB write throws after,
    // the user is locked out but their data is intact — recoverable via
    // the support restore path.
    const sub = payload?.sub;
    if (typeof sub === 'string' && sub) {
      try {
        await adminDisableUser(
          config.cognitoUserPoolId,
          config.awsRegion,
          sub,
        );
      } catch (err) {
        logger.error(
          { event: 'cognito_disable_failed', userId, sub, err },
          'AdminDisableUser threw — refusing to proceed with DB soft-delete',
        );
        return ctx.json({ error: 'CognitoDisableFailed' }, 502);
      }
    }

    const wasNewlyDeleted = await softDeleteUser(getPool(config), userId, reason);

    // Revoke the GitHub App installation now that deletion is committed. The
    // soft-delete keeps the oauth_connections row (so installation_id is still
    // available), but the App lives on GitHub — RDS deletion alone would leave
    // it installed and able to mint tokens. Best-effort + idempotent (404-safe
    // on retry); a failure here is caught by the reconciliation sweep.
    const githubUninstall = await revokeGitHubInstallationForUser(
      getPool(config), config.githubAppId, config.githubPrivateKey, userId,
    );

    logger.warn(
      {
        event:    wasNewlyDeleted ? 'account_soft_deleted' : 'account_already_deleted',
        userId,
        hasReason: Boolean(reason),
        githubUninstall,
      },
      'account termination completed',
    );

    return ctx.json({ ok: true, alreadyDeleted: !wasNewlyDeleted });
  });

  return router;
}
