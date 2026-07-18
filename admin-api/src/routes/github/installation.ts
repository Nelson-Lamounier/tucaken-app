/**
 * @format
 * admin-api — GitHub App installation routes.
 *
 * Routes (mounted under /api/admin/github by the github.ts facade):
 *   GET    /installation — check if GitHub App is installed
 *   POST   /installation — store installation_id after redirect (auto-dispatches repos)
 *   DELETE /installation — disconnect + cascade-delete repos
 *   GET    /repos        — list repos accessible via installation token
 *
 * Token model: only installation_id is stored (oauth_connections); 1-hour
 * read-only installation tokens are generated on the fly. No PAT persisted.
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { deleteConnection } from '../../lib/github/connection.js';
import {
    deleteInstallation,
    generateInstallationToken,
    getInstallationInfo,
    listInstallationRepos,
} from '../../lib/github/github-app.js';
import { getPool } from '../../lib/pg.js';
import { getUserPlanStatus } from '../../lib/repositories/users.js';
import { AdminApiBindings, requireUserId } from '../../lib/types.js';
import { domainErrorBoundary } from '../../lib/route-error-boundary.js';
import {
    autoDispatchRepos,
    buildRepoIdMap,
    getConnection,
    listConnectedRepos,
    requireGitHubConfig,
    upsertConnection,
} from './github-shared.js';

export function createInstallationRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    // Error boundary — consistent JSON error shape (same as the other github routers)
    router.onError(domainErrorBoundary('github'));

    // -------------------------------------------------------------------------
    // GET /installation — check connection status
    // -------------------------------------------------------------------------
    router.get('/installation', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const conn = await getConnection(pool, uid);
        if (!conn?.installation_id) return ctx.json({ error: 'Not connected' }, 404);

        // Fetch live repo count using a fresh installation token.
        const [appId, key] = requireGitHubConfig(config);
        const token = await generateInstallationToken(appId, key, conn.installation_id);
        const repos  = await listInstallationRepos(token);

        return ctx.json({
            installation: {
                installationId:     conn.installation_id,
                accountLogin:       conn.username,
                accountAvatarUrl:   conn.avatar_url ?? '',
                repositoryCount:    repos.length,
                connectedAt:        conn.connected_at.toISOString(),
            },
        });
    });

    // -------------------------------------------------------------------------
    // POST /installation — store installation_id from GitHub redirect.
    //
    // Auto-sync behaviour:
    //   Fresh install  — just store the connection. UI picker adds repos.
    //   Re-install     — re-dispatch all previously connected repos with
    //                    FORCE_REINDEX=true so RDS embeddings are rebuilt.
    //                    Counted against the monthly quota.
    //
    // Body: { installationId: string }
    // -------------------------------------------------------------------------
    router.post('/installation', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const [appId, key] = requireGitHubConfig(config);

        let body: { installationId?: string };
        try { body = await ctx.req.json(); }
        catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

        const installationId = body.installationId?.trim();
        if (!installationId) return ctx.json({ error: '"installationId" is required' }, 400);

        // Detect re-install BEFORE upsert so isReinstall is accurate.
        // Require an existing installation_id: a row with no installation_id is a
        // partial/failed prior connect, not a real previous session.
        const existing    = await getConnection(pool, uid);
        const isReinstall = existing !== null && existing.installation_id !== null;

        const info = await getInstallationInfo(appId, key, installationId);
        await upsertConnection(pool, uid, info.accountId, installationId, info.accountLogin, info.accountAvatarUrl);

        if (!isReinstall) {
            // Fresh install — return immediately; user picks repos via the UI picker.
            return ctx.json({ success: true, queued: [] });
        }

        // Re-install: re-dispatch previously connected repos with full re-index.
        const connected = await listConnectedRepos(pool, uid);
        if (connected.length === 0) {
            return ctx.json({ success: true, queued: [] });
        }

        const token = await generateInstallationToken(appId, key, installationId);

        const installPlanStatus    = await getUserPlanStatus(pool, uid);
        const installEffectivePlan = installPlanStatus?.effectivePlan ?? 'free';
        const installRole          = installPlanStatus?.role ?? null;

        const idMap = await buildRepoIdMap(token);
        const queued = await autoDispatchRepos(
            config, pool, uid, installEffectivePlan, installRole,
            connected.map(r => ({ full_name: r.full_name, default_branch: r.default_branch, github_repo_id: idMap.get(r.full_name) ?? null })),
            token,
            true, // forceReindex
        );

        console.log(`[github/installation] re-install for ${uid}: queued ${queued.length}/${connected.length} repos`);
        return ctx.json({ success: true, queued });
    });

    // -------------------------------------------------------------------------
    // DELETE /installation — uninstall GitHub App + cascade-delete all repo data
    //
    // Order matters:
    //   1. Revoke the GitHub App installation (so the App is removed from the
    //      user's GitHub account, not just from our DB).
    //   2. Clean up local DB regardless — user's intent is always to disconnect.
    //
    // Non-fatal GitHub errors: log and proceed. A 404 means the installation was
    // already deleted from GitHub (e.g. the user uninstalled from GitHub settings
    // first, which fires the installation.deleted webhook — handled above), so the
    // DB cleanup is still required.
    // -------------------------------------------------------------------------
    router.delete('/installation', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const conn = await getConnection(pool, uid);
        if (!conn) return ctx.json({ error: 'Not connected' }, 404);

        if (conn.installation_id) {
            const [appId, key] = requireGitHubConfig(config);
            try {
                await deleteInstallation(appId, key, conn.installation_id);
                console.log(`[github/disconnect] revoked installation ${conn.installation_id} for user ${uid}`);
            } catch (err) {
                // Non-fatal: log and continue so local DB is always cleaned up.
                console.error(`[github/disconnect] GitHub App deletion failed (proceeding with DB cleanup):`, (err as Error).message);
            }
        }

        await deleteConnection(pool, uid);
        return ctx.json({ success: true });
    });

    // -------------------------------------------------------------------------
    // GET /repos — list repos accessible via the App installation
    // -------------------------------------------------------------------------
    router.get('/repos', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const conn = await getConnection(pool, uid);
        if (!conn?.installation_id) return ctx.json({ error: 'GitHub not connected' }, 404);

        const [appId, key] = requireGitHubConfig(config);
        const token = await generateInstallationToken(appId, key, conn.installation_id);
        const raw   = await listInstallationRepos(token);

        const repos = raw.map(r => ({
            id:            r.id,
            fullName:      r.full_name,
            owner:         r.owner.login,
            name:          r.name,
            defaultBranch: r.default_branch,
            private:       r.private,
            updatedAt:     r.updated_at,
        }));

        return ctx.json({ repos });
    });

    return router;
}
