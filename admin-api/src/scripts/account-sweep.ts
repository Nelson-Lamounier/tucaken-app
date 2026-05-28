/**
 * @format
 * Daily account-deletion sweep — Phase 2 of the soft-delete flow.
 *
 * Designed to run as a K8s CronJob (one Pod / day) using the existing
 * admin-api image. Loads the same Pool as the HTTP server, finds users
 * whose `deleted_at` is older than the grace window, then for each:
 *
 *   1. Cognito — `AdminDeleteUser` so the email is freed for re-registration.
 *   2. Postgres — `DELETE FROM users WHERE id = $1`. Children cascade.
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
 *   GRACE_DAYS=0 npx tsx admin-api/src/scripts/account-sweep.ts --dry-run
 */

import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Pool } from 'pg';

import { revokeGitHubInstallationForUser } from '../lib/github-uninstall.js';
import {
  findUsersForHardDelete,
  hardDeleteUser,
} from '../lib/repositories/users.js';

const GRACE_DAYS = Number(process.env['GRACE_DAYS'] ?? '30');
const DRY_RUN    = process.argv.includes('--dry-run');
const GITHUB_APP_ID      = process.env['GITHUB_APP_ID'];
const GITHUB_PRIVATE_KEY = process.env['GITHUB_PRIVATE_KEY'];

interface SweepResult {
  total: number;
  purged: string[];
  skipped: Array<{ id: string; reason: string }>;
}

async function deleteFromCognito(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  sub: string,
): Promise<void> {
  try {
    await cognito.send(
      new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: sub }),
    );
  } catch (err) {
    if (err instanceof UserNotFoundException) return;
    throw err;
  }
}

async function main(): Promise<SweepResult> {
  const pool = new Pool({
    host:     process.env['PG_HOST'],
    port:     Number(process.env['PG_PORT'] ?? 5432),
    database: process.env['PG_DATABASE'],
    user:     process.env['PG_USER'],
    password: process.env['PG_PASSWORD'],
    ssl:      { rejectUnauthorized: false },
    max:      1,
  });

  const cognito = new CognitoIdentityProviderClient({
    region: process.env['AWS_REGION'] ?? 'eu-west-1',
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

  for (const user of candidates) {
    const ctx = { id: user.id, email: user.email, deletedAt: user.deletedAt };
    if (DRY_RUN) {
      // eslint-disable-next-line no-console
      console.log('[dry-run] would purge', ctx);
      continue;
    }
    try {
      // Uninstall the GitHub App BEFORE the row + oauth_connections cascade
      // away — once the row is gone the installation_id is lost and the App
      // would be orphaned on GitHub. Best-effort; the reconcile sweep is the
      // backstop if this fails.
      const gh = await revokeGitHubInstallationForUser(
        pool, GITHUB_APP_ID, GITHUB_PRIVATE_KEY, user.id,
      );
      await deleteFromCognito(cognito, userPoolId, user.id);
      await hardDeleteUser(pool, user.id);
      result.purged.push(user.id);
      // eslint-disable-next-line no-console
      console.log('purged', { ...ctx, githubUninstall: gh });
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
