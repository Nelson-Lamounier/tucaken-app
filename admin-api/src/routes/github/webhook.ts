/**
 * @format
 * admin-api — GitHub webhook route (unauthenticated, HMAC-verified).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { deleteConnection } from '../../lib/github/connection.js';
import { generateInstallationToken } from '../../lib/github/github-app.js';
import { reconcileRepoName } from '../../lib/github/reconcile-repo-name.js';
import { tryClaimSyncSlot } from '../../lib/github/sync-state.js';
import { getPool } from '../../lib/pg.js';
import { getUserPlanStatus } from '../../lib/repositories/users.js';
import { getCachedTierConfig } from '../../lib/billing/tier-config-cache.js';
import {
    PUSH_COOLDOWN_MS,
    autoDispatchRepos,
    buildRepoIdMap,
    checkAndIncrementQuota,
    decrementQuota,
    dispatchIngestionJob,
    getPlanLimit,
    listConnectedRepos,
    lookupUserByInstallation,
    markSyncTriggered,
    requireGitHubConfig,
} from './github-shared.js';

/**
 * POST /webhook
 *
 * Receives GitHub App webhook events. No Cognito JWT required — GitHub signs
 * payloads with HMAC-SHA256 using the webhook secret instead.
 *
 * Handled events:
 *   installation.created  — Option B: if user already known, auto-sync repos
 *                           in payload (safety net for GitHub-initiated installs).
 *                           Fresh installs: no-op (user goes through UI redirect
 *                           which triggers POST /installation = Option A).
 *   installation.deleted  — remove oauth_connections row(s) for the installation
 *   installation.suspend / installation.unsuspend — no-op (acknowledged)
 *   push                  — incremental re-index for connected repos (debounced,
 *                           quota-checked, 30-minute cooldown per repo)
 *   *                     — acknowledged with 200, not processed
 *
 * GitHub retries on any non-2xx. Always return 200 once signature is verified,
 * even for unhandled event types, to avoid spurious retries.
 */
export function createGitHubWebhookRouter(config: AdminApiConfig): Hono {
    const router = new Hono();

    router.post('/webhook', async (ctx) => {
        // ── 1. Require webhook secret to be configured ────────────────────────
        const { githubWebhookSecret } = config;
        if (!githubWebhookSecret) {
            console.warn('[github/webhook] GITHUB_WEBHOOK_SECRET not set — endpoint inactive');
            return ctx.json({ error: 'Webhook not configured' }, 501);
        }

        // ── 2. Verify HMAC-SHA256 signature ───────────────────────────────────
        // GitHub sends: X-Hub-Signature-256: sha256=<hex>
        const sigHeader = ctx.req.header('X-Hub-Signature-256') ?? '';
        const rawBody   = await ctx.req.text();

        const expected = 'sha256=' + createHmac('sha256', githubWebhookSecret)
            .update(rawBody)
            .digest('hex');

        // Compare raw buffers — no padding. Length mismatch is itself a rejection signal.
        const sigBuf = Buffer.from(sigHeader);
        const expBuf = Buffer.from(expected);
        const valid  = sigBuf.length === expBuf.length &&
                       timingSafeEqual(sigBuf, expBuf);

        if (!valid) {
            console.warn('[github/webhook] signature mismatch');
            return ctx.json({ error: 'Invalid signature' }, 401);
        }

        // ── 3. Parse event type ───────────────────────────────────────────────
        const eventType = ctx.req.header('X-GitHub-Event') ?? 'unknown';
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
        catch { return ctx.json({ error: 'Invalid JSON payload' }, 400); }

        const action = typeof payload['action'] === 'string' ? payload['action'] : '';

        console.log(`[github/webhook] event=${eventType} action=${action}`);

        // ── 4. installation.deleted — cascade-remove user data ────────────────
        if (eventType === 'installation' && action === 'deleted') {
            const inst = payload['installation'] as Record<string, unknown> | undefined;
            const installationId = String(inst?.['id'] ?? '');

            if (installationId) {
                const pool = getPool(config);
                // Resolve user first so we can cascade via the same deleteConnection helper.
                const user = await lookupUserByInstallation(pool, installationId);
                if (user) {
                    await deleteConnection(pool, user.userId);
                    console.log(`[github/webhook] deleted installation ${installationId} for user ${user.userId}`);
                } else {
                    // Fallback: direct delete by installation_id (no cascades through app helpers).
                    await pool.query(
                        `DELETE FROM oauth_connections
                         WHERE provider = 'github' AND installation_id = $1`,
                        [installationId],
                    );
                    console.log(`[github/webhook] removed installation ${installationId} (user not found — direct delete)`);
                }
            }
            return ctx.json({ ok: true });
        }

        // ── 5. installation.created — Option B safety net ─────────────────────
        // Fires immediately after GitHub App install. The UI redirect (Option A)
        // usually wins the race for fresh installs. This handler only acts when
        // the user is ALREADY known (e.g. GitHub-initiated reinstall bypassing the UI).
        //
        // Dispatches for repos already in the KB (not for payload.repositories),
        // so we never create new KB entries or dispatch jobs for repos the user
        // never explicitly added.
        if (eventType === 'installation' && action === 'created') {
            const inst           = payload['installation'] as Record<string, unknown> | undefined;
            const installationId = String(inst?.['id'] ?? '');

            if (installationId) {
                const pool = getPool(config);
                const user = await lookupUserByInstallation(pool, installationId);

                if (user) {
                    // User already linked — re-dispatch their existing KB repos.
                    const connected = await listConnectedRepos(pool, user.userId);
                    if (connected.length > 0) {
                        const [appId, key] = requireGitHubConfig(config);
                        const webhookInstallPlanStatus    = await getUserPlanStatus(pool, user.userId);
                        const webhookInstallEffectivePlan = webhookInstallPlanStatus?.effectivePlan ?? 'free';
                        const webhookInstallRole          = webhookInstallPlanStatus?.role ?? null;
                        const token = await generateInstallationToken(appId, key, installationId);
                        const idMap = await buildRepoIdMap(token);
                        const queued = await autoDispatchRepos(
                            config, pool, user.userId, webhookInstallEffectivePlan, webhookInstallRole,
                            connected.map(r => ({ full_name: r.full_name, default_branch: r.default_branch, github_repo_id: idMap.get(r.full_name) ?? null })),
                            token,
                            false,
                        );
                        console.log(`[github/webhook] installation.created: queued ${queued.length} KB repos for user ${user.userId}`);
                    }
                } else {
                    // Fresh install — user not yet linked. Option A (POST /installation) handles this.
                    console.log(`[github/webhook] installation.created: user not yet linked for ${installationId} — awaiting UI redirect`);
                }
            }
            return ctx.json({ ok: true });
        }

        // ── 6. push — incremental re-index (debounced, quota-enforced) ────────
        if (eventType === 'push') {
            const inst         = payload['installation'] as Record<string, unknown> | undefined;
            const repo         = payload['repository']   as Record<string, unknown> | undefined;
            const installationId  = String(inst?.['id']       ?? '');
            const repoFullName    = String(repo?.['full_name'] ?? '');

            if (!installationId || !repoFullName) {
                return ctx.json({ ok: true });
            }

            const pool = getPool(config);

            // Resolve user
            const user = await lookupUserByInstallation(pool, installationId);
            if (!user) return ctx.json({ ok: true });

            // Check repo is actively connected to the KB
            const { rows: repoRows } = await pool.query<{ full_name: string }>(
                `SELECT full_name FROM repositories
                 WHERE user_id = $1::uuid AND provider = 'github' AND full_name = $2`,
                [user.userId, repoFullName],
            );
            if (!repoRows[0]) return ctx.json({ ok: true });

            // Debounce: skip if already running or within cooldown window
            const { rows: syncRows } = await pool.query<{
                sync_status:          string | null;
                last_sync_triggered_at: Date | null;
            }>(
                `SELECT sync_status, last_sync_triggered_at
                 FROM repo_sync_state
                 WHERE user_id = $1::uuid AND repo_full_name = $2`,
                [user.userId, repoFullName],
            );
            const syncState = syncRows[0];

            if (syncState?.sync_status === 'pending' || syncState?.sync_status === 'syncing') {
                console.log(`[github/webhook] push skipped — job already running for ${repoFullName}`);
                return ctx.json({ ok: true });
            }

            if (syncState?.last_sync_triggered_at) {
                const elapsed = Date.now() - new Date(syncState.last_sync_triggered_at).getTime();
                if (elapsed < PUSH_COOLDOWN_MS) {
                    console.log(`[github/webhook] push skipped — cooldown active for ${repoFullName} (${Math.round(elapsed / 60000)}m elapsed)`);
                    return ctx.json({ ok: true });
                }
            }

            // Quota check + resolve plan/role for enrichment depth.
            const pushPlanStatus    = await getUserPlanStatus(pool, user.userId);
            const pushEffectivePlan = pushPlanStatus?.effectivePlan ?? 'free';
            const pushRole          = pushPlanStatus?.role ?? null;
            const pushTierConfig    = await getCachedTierConfig(pool);
            const limit   = getPlanLimit(pushTierConfig, pushEffectivePlan, pushRole);
            const allowed = await checkAndIncrementQuota(pool, user.userId, limit);
            if (!allowed) {
                console.log(`[github/webhook] push skipped — quota exceeded for user ${user.userId}`);
                return ctx.json({ ok: true });
            }

            // Dispatch incremental re-index
            const [appId, key] = requireGitHubConfig(config);
            const token = await generateInstallationToken(appId, key, installationId);

            // Race-free backstop: the sync_status SELECT above is check-then-act
            // — two pushes landing together both read 'complete' and pass it. The
            // atomic claim is the real gate. Lost it → a concurrent push already
            // dispatched; refund the quota we just charged and skip so we never
            // run two Jobs racing document_embeddings writes for the same repo.
            if (!(await tryClaimSyncSlot(pool, user.userId, repoFullName))) {
                await decrementQuota(pool, user.userId).catch(() => {});
                console.log(`[github/webhook] push skipped — concurrent dispatch won the claim for ${repoFullName}`);
                return ctx.json({ ok: true });
            }
            await markSyncTriggered(pool, user.userId, repoFullName);

            try {
                const { jobName } = await dispatchIngestionJob(
                    config, user.userId, repoFullName, token,
                    false, // incremental — hash-dedup skips unchanged chunks
                    pushEffectivePlan, pushRole,
                );
                console.log(`[github/webhook] push re-index queued for ${repoFullName}: job=${jobName}`);
            } catch (err) {
                console.error(`[github/webhook] push dispatch failed for ${repoFullName}`, (err as Error).message);
            }

            return ctx.json({ ok: true });
        }

        // ── 7. repository.renamed / transferred — refresh the display label ───
        // GitHub renames/transfers are metadata-only: the immutable numeric repo
        // id is unchanged, only `full_name` moves. Re-stamp the denormalised
        // label everywhere via the idempotent reconcileRepoName routine, keyed on
        // github_repo_id, instead of re-ingesting.
        if (eventType === 'repository' && (action === 'renamed' || action === 'transferred')) {
            const inst = payload['installation'] as Record<string, unknown> | undefined;
            const repo = payload['repository']   as Record<string, unknown> | undefined;
            const installationId = String(inst?.['id'] ?? '');
            const rawId          = repo?.['id'];
            const githubRepoId   = typeof rawId === 'number' ? rawId : Number(rawId);
            const newFullName    = typeof repo?.['full_name'] === 'string' ? repo['full_name'] : '';

            if (!installationId || !Number.isFinite(githubRepoId) || !newFullName) {
                return ctx.json({ ok: true });
            }

            const pool = getPool(config);
            const user = await lookupUserByInstallation(pool, installationId);
            if (!user) return ctx.json({ ok: true });

            // Acknowledge GitHub immediately (its delivery timeout is ~10s); the
            // reconcile touches a denormalised label across ~19 tables incl. the
            // vector-indexed document_embeddings and can exceed that. It is
            // idempotent and also covered by the worker's sync-time self-heal, so
            // running it in the background after the 200 is safe.
            void reconcileRepoName(pool, user.userId, githubRepoId, newFullName)
                .then(() => {
                    console.log(`[github/webhook] repository.${action}: reconciled repo ${githubRepoId} -> ${newFullName} for user ${user.userId}`);
                })
                .catch((err) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    console.error(`[github/webhook] reconcile failed for repo ${githubRepoId}`, msg);
                });
            return ctx.json({ ok: true });
        }

        // ── 8. All other events — acknowledge without processing ──────────────
        return ctx.json({ ok: true });
    });

    return router;
}
