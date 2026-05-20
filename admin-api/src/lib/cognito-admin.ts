/**
 * @format
 * Cognito Admin helpers used by the account-termination flow.
 *
 * Both calls require IAM on the pod's IRSA — see cdk-monitoring
 * EksPodIdentityStack case 'admin-api' which grants
 *   cognito-idp:AdminDisableUser
 *   cognito-idp:AdminDeleteUser
 * on the configured user pool.
 *
 * The sub claim is the canonical Cognito identifier (NOT email) — Cognito
 * allows email reuse after a delete + create, but subs are unique forever.
 */

import {
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';

import { logger } from './observability/logger.js';

let _client: CognitoIdentityProviderClient | null = null;

function client(region: string): CognitoIdentityProviderClient {
  if (_client) return _client;
  _client = new CognitoIdentityProviderClient({ region });
  return _client;
}

/**
 * Disable login for a user during the soft-delete grace window. Idempotent —
 * already-disabled users return silently. UserNotFoundException is treated as
 * success because the only valid recovery from "Cognito user missing" is to
 * proceed with the DB soft-delete (the user can't log in anyway).
 */
export async function adminDisableUser(
  userPoolId: string,
  region: string,
  sub: string,
): Promise<void> {
  try {
    await client(region).send(
      new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: sub }),
    );
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      logger.warn(
        { event: 'cognito_disable_user_not_found', sub },
        'AdminDisableUser: Cognito user already gone, continuing with DB soft-delete',
      );
      return;
    }
    throw err;
  }
}

/**
 * Hard-delete a Cognito user. Called by the daily account-sweep after the
 * grace window expires. Frees the email for re-registration.
 *
 * Idempotent: UserNotFoundException treated as success.
 */
export async function adminDeleteUser(
  userPoolId: string,
  region: string,
  sub: string,
): Promise<void> {
  try {
    await client(region).send(
      new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: sub }),
    );
  } catch (err) {
    if (err instanceof UserNotFoundException) return;
    throw err;
  }
}

/**
 * Re-enable a previously-disabled user during the grace window. Used by
 * the support-tool restore endpoint after `restoreSoftDeletedUser`.
 */
export async function adminEnableUser(
  userPoolId: string,
  region: string,
  sub: string,
): Promise<void> {
  try {
    await client(region).send(
      new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: sub }),
    );
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      logger.warn(
        { event: 'cognito_enable_user_not_found', sub },
        'AdminEnableUser: Cognito user no longer exists — sweep already purged it',
      );
      return;
    }
    throw err;
  }
}

/**
 * Test/ops helper — bust the cached client so unit tests can swap in a mock.
 */
export function _resetCognitoAdminClient(): void {
  _client = null;
}
