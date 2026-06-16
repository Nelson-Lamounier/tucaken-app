/**
 * @format
 * /api/public/* — unauthenticated endpoints safe to call before sign-in.
 *
 * These routes are registered BEFORE the Cognito JWT middleware in index.ts
 * and carry no user context. Keep them read-only and non-sensitive.
 *
 * GET /email-exists?email=<address>
 *   Returns { exists: boolean } — used by the sign-up form to detect
 *   cross-provider duplicates (e.g. Google user trying to register with
 *   email/password) before Cognito creates a conflicting native user.
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { getPool } from '../lib/pg.js';
import { userExistsByEmail } from '../lib/repositories/users.js';

const EMAIL_EXISTS_LIMIT = 10;
const EMAIL_EXISTS_WINDOW_MS = 15 * 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const emailExistsBuckets = new Map<string, Bucket>();

function callerIp(ctx: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = ctx.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || ctx.req.header('x-real-ip') || 'unknown';
}

function checkEmailExistsLimit(ip: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = emailExistsBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    emailExistsBuckets.set(ip, { count: 1, resetAt: now + EMAIL_EXISTS_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= EMAIL_EXISTS_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function _resetPublicRouteRateLimits(): void {
  emailExistsBuckets.clear();
}

export function createPublicRouter(config: AdminApiConfig): Hono {
  const router = new Hono();

  router.get('/email-exists', async (ctx) => {
    const limit = checkEmailExistsLimit(callerIp(ctx));
    if (!limit.allowed) {
      ctx.header('Retry-After', String(limit.retryAfterSeconds));
      return ctx.json({ error: 'Too many requests' }, 429);
    }

    const email = ctx.req.query('email')?.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return ctx.json({ error: 'Valid email required' }, 400);
    }

    const exists = await userExistsByEmail(getPool(config), email);
    return ctx.json({ exists });
  });

  return router;
}
