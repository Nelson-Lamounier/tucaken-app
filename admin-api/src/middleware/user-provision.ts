/**
 * @format
 * admin-api — User provisioning middleware.
 *
 * Runs after cognitoJwtAuth on every /api/admin/* request.
 * On the first request for a given Cognito sub, upserts a row into users
 * and user_identities, caching the resolved users.id for the pod lifetime.
 *
 * Provider detection:
 *   Cognito embeds an `identities` claim for federated users (Google/GitHub).
 *   Format: [{ providerName: "Google", userId: "...", ... }]
 *   Native email/password users have no `identities` claim — provider = 'email'.
 *
 * Cache rationale:
 *   Sub → users.id never changes after provisioning. Pod restart re-runs the
 *   upsert (idempotent — safe).
 *
 * Failure handling:
 *   Provisioning failure is logged but never blocks the request.
 *   Child-table inserts will fail at the FK constraint, surfacing as a 500
 *   from the relevant route rather than silently corrupting data.
 */
import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Pool } from 'pg';

import { logger } from '../lib/observability/logger.js';
import { authProvisionTotal } from '../lib/observability/metrics.js';
import { provisionUserWithPendingLink } from '../lib/repositories/users.js';
import type { AdminApiBindings } from '../lib/types.js';

interface CognitoIdentity {
  providerName:     string;
  providerType:     string;
  userId:           string;
  primary:          string;
  isEmailVerified:  string;
}

/**
 * Extract the auth provider from the Cognito JWT identities claim.
 * Returns 'google' | 'github' | 'email' (lowercase, stable values).
 */
function resolveProvider(payload: Record<string, unknown>): { provider: string; providerUserId?: string } {
  const raw = payload['identities'];
  if (!raw) return { provider: 'email' };

  let identities: CognitoIdentity[];
  try {
    identities = typeof raw === 'string' ? JSON.parse(raw) : (raw as CognitoIdentity[]);
  } catch {
    return { provider: 'email' };
  }

  const primary = identities.find((i) => i.primary === 'true') ?? identities[0];
  if (!primary) return { provider: 'email' };

  return {
    provider:        primary.providerName.toLowerCase(),
    providerUserId:  primary.userId,
  };
}

/** sub → users.id cache, lives for the lifetime of the pod process. */
const subToUserId = new Map<string, string>();

export function userProvisionMiddleware(pool: Pool): MiddlewareHandler<AdminApiBindings> {
  return async (ctx: Context<AdminApiBindings>, next: Next): Promise<void> => {
    const payload = ctx.get('jwtPayload');
    const sub     = payload?.sub;

    if (!sub) {
      await next();
      return;
    }

    // Fast path — already provisioned in this pod's lifetime
    const cached = subToUserId.get(sub as string);
    if (cached) {
      ctx.set('userId', cached);
      authProvisionTotal.inc({ outcome: 'returning' });
      await next();
      return;
    }

    // Slow path — first request for this sub in this pod
    try {
      const { provider, providerUserId } = resolveProvider(payload as Record<string, unknown>);

      // cognitoJwtAuth verifies the token but does NOT check group membership —
      // requireAdminGroup() gates the staff mounts separately. Mirror the
      // Cognito group into the DB role so queries and audit logs can use it
      // without re-reading the JWT.
      const groups = (payload['cognito:groups'] as string[] | undefined) ?? [];
      const role   = groups.includes('admin') ? 'admin' : 'user';

      // Atomic provisioning: user upsert + (optional) Stripe pending-link in
      // ONE transaction. If either step throws, both are rolled back, the
      // sub→id cache is NOT populated (we set it below only on success), and
      // the next request retries from scratch. This makes the previously
      // documented race window (user committed, link failed) impossible.
      const { id, isNew, linkedSubscription } = await provisionUserWithPendingLink(
        pool,
        {
          cognitoSub:      sub as string,
          provider,
          providerUserId,
          email:           (payload['email']   as string) ?? '',
          fullName:        (payload['name']    as string) ?? undefined,
          avatarUrl:       (payload['picture'] as string) ?? undefined,
          role,
        },
      );

      subToUserId.set(sub as string, id);
      ctx.set('userId', id);
      ctx.set('isNewUser', isNew);

      const outcome = isNew ? 'new_user' : 'returning';
      authProvisionTotal.inc({ outcome });

      if (isNew) {
        logger.info(
          { event: 'user_provisioned', userId: id, provider, role, outcome: 'new_user' },
          'new user provisioned on first sign-in',
        );
      }
      if (linkedSubscription) {
        // Logged for BOTH new and returning users — covers two paths:
        //   · new user paid as guest before signup
        //   · returning user paid as guest after signup (e.g. signed up via
        //     marketing email, then bought from /pricing without re-auth)
        logger.info(
          {
            event:      'pending_subscription_linked',
            userId:     id,
            customerId: linkedSubscription.stripeCustomerId,
            plan:       linkedSubscription.plan,
            isNew,
          },
          'pending Stripe subscription linked to user',
        );
      }
    } catch (err) {
      authProvisionTotal.inc({ outcome: 'error' });
      logger.error(
        { event: 'user_provision_failed', sub, err },
        'upsertUser threw — userId not set; /me will return 503',
      );
    }

    await next();
  };
}
