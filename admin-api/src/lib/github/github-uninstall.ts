/**
 * @format
 * Best-effort revocation of a user's GitHub App installation on GitHub's side.
 *
 * RDS only stores the installation_id; the App itself lives on GitHub's
 * servers. Deleting user data from RDS (account termination, hard-delete
 * purge, a stray cascade) does NOT remove the installation — it would be left
 * orphaned and still able to mint installation tokens. This helper closes that
 * gap by calling DELETE /app/installations/{id} via the App JWT.
 *
 * Contract: NEVER throws. RDS deletion must proceed regardless of GitHub's
 * availability. Callers get the outcome back for logging/metrics; anything
 * that fails here is meant to be swept up later by the reconciliation job.
 */
import type { Pool } from 'pg';

import { deleteInstallation } from './github-app.js';
import { logger } from '../observability/logger.js';

export type RevokeOutcome = 'revoked' | 'not_connected' | 'not_configured' | 'failed';

/**
 * Revoke a single user's GitHub App installation. Takes the App credentials
 * explicitly (rather than the full AdminApiConfig) so it works both from the
 * HTTP server (passing config.githubAppId/githubPrivateKey) and from one-shot
 * CronJob scripts that only load PG + GitHub env vars.
 */
export async function revokeGitHubInstallationForUser(
  pool: Pool,
  appId: string | undefined,
  privateKey: string | undefined,
  userId: string,
): Promise<RevokeOutcome> {
  if (!appId || !privateKey) return 'not_configured';

  let installationId: string | null | undefined;
  try {
    const { rows } = await pool.query<{ installation_id: string | null }>(
      `SELECT installation_id FROM oauth_connections
       WHERE user_id = $1::uuid AND provider = 'github'`,
      [userId],
    );
    installationId = rows[0]?.installation_id;
  } catch (err) {
    logger.error(
      { event: 'github_uninstall_lookup_failed', userId, err },
      'failed to read installation_id — skipping GitHub uninstall',
    );
    return 'failed';
  }

  if (!installationId) return 'not_connected';

  try {
    // deleteInstallation resolves silently on 404 (already uninstalled).
    await deleteInstallation(appId, privateKey, installationId);
    logger.warn(
      { event: 'github_uninstall_revoked', userId, installationId },
      'revoked GitHub App installation',
    );
    return 'revoked';
  } catch (err) {
    logger.error(
      { event: 'github_uninstall_failed', userId, installationId, err },
      'GitHub App uninstall failed — installation may be orphaned until reconciliation',
    );
    return 'failed';
  }
}
