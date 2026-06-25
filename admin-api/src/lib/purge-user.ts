/**
 * @format
 * Single source of truth for the hard-delete sequence. Reused by the daily
 * account-sweep (loops over expired soft-deletes) and the admin "purge now"
 * endpoint (one user, synchronous outcome).
 *
 * Order is load-bearing: revoke the GitHub App BEFORE the DB row (and its
 * oauth_connections) cascade away — once gone, installation_id is lost and the
 * App is orphaned on GitHub. GitHub revoke is best-effort (never throws); the
 * reconciliation sweep is the backstop. Cognito + DB failures propagate so the
 * caller can abort and leave the row soft-deleted for a later retry.
 */
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import type { Pool } from 'pg'

import { adminDeleteUser } from './cognito-admin.js'
import type { RevokeOutcome } from './github-uninstall.js'
import { revokeGitHubInstallationForUser } from './github-uninstall.js'
import { hardDeleteUser } from './repositories/users.js'

export interface PurgeUserDeps {
  pool: Pool
  cognito: CognitoIdentityProviderClient
  userPoolId: string
  region: string
  githubAppId: string | undefined
  githubPrivateKey: string | undefined
}

export interface PurgeOutcome {
  githubUninstall: RevokeOutcome
  cognitoDeleted: boolean
  dbDeleted: boolean
}

export async function purgeUser(
  deps: PurgeUserDeps,
  userId: string,
  cognitoSub: string,
): Promise<PurgeOutcome> {
  const githubUninstall = await revokeGitHubInstallationForUser(
    deps.pool, deps.githubAppId, deps.githubPrivateKey, userId,
  )
  await adminDeleteUser(deps.userPoolId, deps.region, cognitoSub)
  await hardDeleteUser(deps.pool, userId)
  return { githubUninstall, cognitoDeleted: true, dbDeleted: true }
}
