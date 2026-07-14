/**
 * @format
 * Daily account-deletion sweep — Phase 2 of the soft-delete flow.
 *
 * Designed to run as a K8s CronJob (one Pod / day) using the existing
 * admin-api image. Loads the same Pool as the HTTP server, finds users
 * whose `deleted_at` is older than the grace window, then for each:
 *
 *   1. GitHub App — revoke the installation (best-effort).
 *   2. Cognito — `AdminDeleteUser` so the email is freed for re-registration.
 *   3. Postgres — `DELETE FROM users WHERE id = $1`. Children cascade.
 *
 * Stripe customer deletion is intentionally NOT performed here. Stripe
 * recommends keeping customer records for tax/invoice retention; an
 * already-cancelled subscription costs nothing. If GDPR compliance later
 * requires customer purge, do it from tucaken-app (where the Stripe SDK
 * already lives) by calling `stripe.customers.del()` in a separate worker.
 *
 * Idempotency: each external call is wrapped in a try/catch that treats
 * "already gone" as success. Failures abort that user's purge so partial
 * state is not committed; the row stays soft-deleted for the next run.
 *
 * Trigger locally for verification:
 *   GRACE_DAYS=0 yarn dlx tsx admin-api/src/scripts/account-sweep.ts --dry-run
 */

import { Pool } from 'pg';

import { purgeUser } from '../lib/account/purge-user.js';
import { findUsersForHardDelete } from '../lib/repositories/users.js';

const GRACE_DAYS = Number(process.env['GRACE_DAYS'] ?? '30');
const DRY_RUN    = process.argv.includes('--dry-run');
const GITHUB_APP_ID      = process.env['GITHUB_APP_ID'];
const GITHUB_PRIVATE_KEY = process.env['GITHUB_PRIVATE_KEY'];

interface SweepResult {
  total: number;
  purged: string[];
  skipped: Array<{ id: string; reason: string }>;
}

async function main(): Promise<SweepResult> {
  const pool = new Pool({
    host:     process.env['PG_HOST'],
    port:     Number(process.env['PG_PORT'] ?? 5432),
    database: process.env['PG_DATABASE'],
    user:     process.env['PG_USER'],
    password: process.env['PG_PASSWORD'],
    max:      1,
  });

  const userPoolId =
    process.env['COGNITO_USER_POOL_ID'] ??
    (process.env['COGNITO_ISSUER_URL'] ?? '').split('/').pop() ??
    '';
  if (!userPoolId) throw new Error('COGNITO_USER_POOL_ID is not set.');

  const candidates = await findUsersForHardDelete(pool, GRACE_DAYS);
  const result: SweepResult = {
    total:   candidates.length,
    purged:  [],
    skipped: [],
  };

  const deps = {
    pool,
    userPoolId,
    region: process.env['AWS_REGION'] ?? 'eu-west-1',
    githubAppId: GITHUB_APP_ID,
    githubPrivateKey: GITHUB_PRIVATE_KEY,
  };

  for (const user of candidates) {
    const ctx = { id: user.id, email: user.email, deletedAt: user.deletedAt };
    if (DRY_RUN) {
      // eslint-disable-next-line no-console
      console.log('[dry-run] would purge', ctx);
      continue;
    }
    if (!user.cognitoSub) {
      result.skipped.push({ id: user.id, reason: 'no cognito_sub' });
      continue;
    }
    try {
      const outcome = await purgeUser(deps, user.id, user.cognitoSub);
      result.purged.push(user.id);
      // eslint-disable-next-line no-console
      console.log('purged', { ...ctx, ...outcome });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.skipped.push({ id: user.id, reason: msg });
      // eslint-disable-next-line no-console
      console.error('purge_failed', { ...ctx, err: msg });
    }
  }

  await pool.end();
  return result;
}

main()
  .then((res) => {
    // eslint-disable-next-line no-console
    console.log('sweep summary', res);
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('sweep failed', err);
    process.exit(1);
  });
