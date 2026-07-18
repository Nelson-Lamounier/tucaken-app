/**
 * @format
 * admin-api — Connected Repository routes.
 *
 * Routes (mounted under /api/admin/github by the github.ts facade):
 *   GET    /connected-repos                     — list repos in the Knowledge Base + sync status
 *   POST   /connected-repos                     — add repo + write pending + dispatch ingestion Job
 *   POST   /connected-repos/sync                — re-sync all connected repos
 *   POST   /connected-repos/mark-timed-out      — operator repair for stuck repos
 *   POST   /connected-repos/:fullName/retry     — retry a failed repo
 *   PATCH  /connected-repos/:fullName/featured  — toggle featured flag
 *   GET    /connected-repos/:fullName/sbom      — CycloneDX SBOM download
 *   GET    /connected-repos/:fullName/croissant — Croissant data-card download
 *   DELETE /connected-repos/:fullName           — remove repo + embeddings
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { croissantFromAggregate, type CroissantAggregateRow } from '../../lib/github/croissant.js';
import { generateInstallationToken } from '../../lib/github/github-app.js';
import { bomFromEvidenceRows } from '../../lib/github/sbom.js';
import { isSyncInFlight, tryClaimSyncSlot } from '../../lib/github/sync-state.js';
import { getPool } from '../../lib/pg.js';
import { dispatchRollupRefresh } from '../../lib/jobs/dispatch-rollup.js';
import type { ProjectIntent } from '../../lib/repositories/projects.js';
import { getUserPlanStatus } from '../../lib/repositories/users.js';
import { entitlementsFromConfig } from '../../lib/billing/entitlements.js';
import { getCachedTierConfig } from '../../lib/billing/tier-config-cache.js';
import { secondsUntilNextMonthUTC } from '../../lib/retry-after.js';
import { AdminApiBindings, requireUserId } from '../../lib/types.js';
import { domainErrorBoundary } from '../../lib/route-error-boundary.js';
import { logger } from '../../lib/observability/logger.js';
import {
    ACTIVE_SYNC_STATUSES,
    MSG_TIMED_OUT,
    autoDispatchRepos,
    buildRepoIdMap,
    checkAndIncrementQuota,
    connectRepoWithDefaultProject,
    countConnectedRepos,
    decrementQuota,
    deleteRepository,
    dispatchIngestionJob,
    dispatchTechExtractJob,
    getConnection,
    getPlanLimit,
    listConnectedRepos,
    lookupGithubRepoId,
    markRepoPending,
    markSyncTriggered,
    reconcileStuckRepos,
    requireGitHubConfig,
} from './github-shared.js';

export function createConnectedReposRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    // Error boundary — consistent JSON error shape (same as the other github routers)
    router.onError(domainErrorBoundary('github'));

    // -------------------------------------------------------------------------
    // GET /connected-repos — list repos added to KB with sync status
    // -------------------------------------------------------------------------
    router.get('/connected-repos', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        let rows = await listConnectedRepos(pool, uid);

        // Reconcile any repo still showing as active against the live K8s Job
        // state, so a crashed pod surfaces as 'error' rather than spinning
        // forever. Re-read only when something actually changed.
        //
        // Reconciliation is strictly best-effort: it must never break listing.
        // A throw here (DB error, K8s API failure, schema drift) would otherwise
        // 500 the whole endpoint and blank the UI — hiding every healthy repo
        // because one is stuck. Degrade to the un-reconciled rows instead; the
        // server-side platform-job-watcher sweep is the backstop.
        const stuck = rows
            .filter(r => ACTIVE_SYNC_STATUSES.has(r.sync_status ?? r.index_status))
            .map(r => ({ fullName: r.full_name, lastSyncTriggeredAt: r.last_sync_triggered_at }));
        if (stuck.length > 0) {
            try {
                const transitioned = await reconcileStuckRepos(config, pool, uid, stuck);
                if (transitioned.size > 0) rows = await listConnectedRepos(pool, uid);
            } catch (err) {
                (ctx.get('logger') ?? logger).warn(
                    { err, domain: 'github/connected-repos' },
                    'reconcile failed — serving un-reconciled list',
                );
            }
        }

        const repos = rows.map(r => {
            const [owner, name] = r.full_name.split('/');
            return {
                repoFullName:      r.full_name,
                owner:             owner ?? '',
                name:              name  ?? '',
                defaultBranch:     r.default_branch,
                syncStatus:        r.sync_status ?? r.index_status,
                lastSyncedAt:      r.last_synced_at?.toISOString(),
                fileCount:         r.file_count ?? 0,
                chunkCount:        r.chunk_count ?? 0,
                embeddedCount:     r.embedded_count ?? null,
                embedTotal:        r.embed_total ?? null,
                phase:             r.phase ?? null,
                phaseDone:         r.phase_done ?? null,
                phaseTotal:        r.phase_total ?? null,
                errorMessage:      r.error_message,
                addedAt:           r.added_at.toISOString(),
                qualityScore:      r.quality_score      ?? null,
                qualityBreakdown:  r.quality_breakdown  ?? null,
                classification:    r.classification     ?? null,
                extractionStatus:  r.extraction_status  ?? null,
                oneLiner:          r.one_liner          ?? null,
                domain:            r.domain             ?? null,
                techStack:         r.tech_stack         ?? null,
                complexity:        r.complexity         ?? null,
                confidence:        r.confidence         ?? null,
                // is_featured/is_hidden are NOT NULL DEFAULT FALSE in repository_profiles;
                // a NULL here only means LEFT-JOIN miss (no profile yet) → default false.
                // Profile display values stay nullable (?? null) so the UI can omit them.
                highlights:        r.highlights         ?? null,
                isFeatured:        r.is_featured        ?? false,
                featureRank:       r.feature_rank       ?? null,
                isHidden:          r.is_hidden          ?? false,
            };
        });

        return ctx.json({ repos });
    });

    // -------------------------------------------------------------------------
    // POST /connected-repos — add repo to KB + write pending + dispatch Job
    // Body: { repoFullName: string, defaultBranch?: string, forceReindex?: boolean }
    // -------------------------------------------------------------------------
    // ── GET /connected-repos/sync-status — lightweight polling probe ─────────
    // One query, NO stuck-repo reconciliation (that calls the K8s API and
    // belongs on the initial page load, not on a 5 s polling loop — see the
    // pool-saturation incident, docs/troubleshooting/).
    router.get('/connected-repos/sync-status', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const rows = await listConnectedRepos(pool, uid);
        return ctx.json({
            repos: rows.map((r) => ({
                repoFullName: r.full_name,
                syncStatus:   r.sync_status ?? r.index_status,
            })),
        });
    });

    router.post('/connected-repos', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const conn = await getConnection(pool, uid);
        if (!conn?.installation_id) return ctx.json({ error: 'GitHub not connected' }, 400);

        let body: { repoFullName?: string; defaultBranch?: string; forceReindex?: boolean; deferSync?: boolean; projectIntent?: 'build' | 'link' | 'none'; targetProjectId?: string };
        try { body = await ctx.req.json(); }
        catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

        const repoFullName = body.repoFullName?.trim();
        if (!repoFullName || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
            return ctx.json({ error: '"repoFullName" must match owner/repo' }, 400);
        }
        const defaultBranch = body.defaultBranch?.trim() || 'main';
        const forceReindex  = body.forceReindex === true;

        // Parse + validate the add-time project intent.
        // 'none' / absent -> undefined (back-compat: KB-only, no project action).
        const rawIntent = body.projectIntent;
        let intent: ProjectIntent | undefined;
        if (rawIntent === 'build') {
            intent = { action: 'build' };
        } else if (rawIntent === 'link') {
            const target = body.targetProjectId?.trim();
            if (!target) return ctx.json({ error: '"targetProjectId" is required when projectIntent is "link"' }, 400);
            // Target must be a confirmed, non-archived project owned by the caller.
            const ok = await pool.query<{ one: number }>(
                `SELECT 1 AS one FROM projects WHERE id = $1::uuid AND user_id = $2::uuid AND is_user_confirmed = TRUE AND status <> 'archived' LIMIT 1`,
                [target, uid],
            );
            if ((ok.rowCount ?? 0) === 0) return ctx.json({ error: 'targetProjectId is not a confirmed project you own' }, 400);
            intent = { action: 'link', targetProjectId: target };
        }
        // 'none'/undefined -> intent stays undefined (back-compat).

        // deferSync (onboarding queue): connect the repo as 'pending' only —
        // no quota consumed, no Job dispatched. POST /connected-repos/sync
        // dispatches the actual ingestion for every queued repo later.
        if (body.deferSync === true) {
            // github_repo_id is NOT NULL post-085, so the deferred connect must
            // resolve the numeric id too — one installation token, one repo list.
            // A repo not in the installation is rejected rather than inserted.
            const [deferAppId, deferKey] = requireGitHubConfig(config);
            const deferToken = await generateInstallationToken(deferAppId, deferKey, conn.installation_id);
            const deferIdMap = await buildRepoIdMap(deferToken);
            const deferId = deferIdMap.get(repoFullName);
            if (deferId === undefined) {
                return ctx.json({ error: 'Repository not found in your GitHub installation' }, 404);
            }
            await connectRepoWithDefaultProject(pool, uid, repoFullName, defaultBranch, deferId, intent);
            await markRepoPending(pool, uid, repoFullName);
            return ctx.json({ status: 'queued', repoFullName, jobName: null }, 202);
        }

        const [appId, key] = requireGitHubConfig(config);

        // Dedup fast path: if a Job is already in flight for this repo, skip
        // without consuming quota. tryClaimSyncSlot below is the race-free
        // backstop for the rare double-click that slips past this read.
        if (await isSyncInFlight(pool, uid, repoFullName)) {
            return ctx.json({ status: 'already_running', repoFullName, jobName: null }, 200);
        }

        // Quota check before any DB write — fail fast without side effects.
        // Also resolves effectivePlan + role for enrichment depth (server-side).
        const planStatus    = await getUserPlanStatus(pool, uid);
        const effectivePlan = planStatus?.effectivePlan ?? 'free';
        const role          = planStatus?.role ?? null;
        const tierConfig    = await getCachedTierConfig(pool);
        const limit = getPlanLimit(tierConfig, effectivePlan, role);
        const allowed = await checkAndIncrementQuota(pool, uid, limit);
        if (!allowed) {
            ctx.header('Retry-After', String(secondsUntilNextMonthUTC()));
            return ctx.json({ error: 'Monthly ingestion limit reached. Upgrade to Pro for unlimited syncs.' }, 429);
        }

        // Per-plan repository-count cap. Re-syncing an existing repo must stay
        // allowed — only NEW connections beyond the cap are blocked.
        const repoAlreadyConnected = await pool
            .query<{ one: number }>(
                `SELECT 1 AS one FROM repositories
                 WHERE user_id = $1::uuid AND provider = 'github' AND full_name = $2
                 LIMIT 1`,
                [uid, repoFullName],
            )
            .then(r => (r.rowCount ?? 0) > 0);
        const repoCap = entitlementsFromConfig(tierConfig, effectivePlan, role).repos;
        if (Number.isFinite(repoCap) && !repoAlreadyConnected) {
            const already = await countConnectedRepos(pool, uid);
            if (already >= repoCap) {
                return ctx.json({
                    error: `Your plan allows ${repoCap} repository${repoCap === 1 ? '' : 's'}. Upgrade for more.`,
                    upgradeUrl: '/pricing',
                }, 403);
            }
        }

        // Insert repo row + mark pending before Job dispatch so the UI
        // shows "Queued" immediately even if pod startup takes a few seconds.
        // Wrapped in try/catch: if anything after the quota increment fails,
        // decrement the counter so the user doesn't lose a monthly credit.
        try {
            // Generate a fresh installation token scoped to this user's repos.
            // Reused for the id lookup and the Job dispatch below.
            const githubToken = await generateInstallationToken(appId, key, conn.installation_id);

            // Resolve the immutable github_repo_id (the conflict key post-085).
            // A repo not in the installation list cannot be inserted — refund the
            // quota we just incremented and report 404 instead of writing a NULL.
            const idMap = await buildRepoIdMap(githubToken);
            const id = idMap.get(repoFullName);
            if (id === undefined) {
                await decrementQuota(pool, uid).catch(() => {});
                return ctx.json({ error: 'Repository not found in your GitHub installation' }, 404);
            }
            await connectRepoWithDefaultProject(pool, uid, repoFullName, defaultBranch, id, intent);

            // Race-free backstop: lost the atomic claim → a concurrent request
            // already dispatched between the fast-path read and here. Refund the
            // quota we just incremented and report the in-flight Job.
            if (!(await tryClaimSyncSlot(pool, uid, repoFullName))) {
                await decrementQuota(pool, uid).catch(() => {});
                return ctx.json({ status: 'already_running', repoFullName, jobName: null }, 200);
            }
            await markSyncTriggered(pool, uid, repoFullName);

            const { jobName } = await dispatchIngestionJob(config, uid, repoFullName, githubToken, forceReindex, effectivePlan, role);

            try {
                await dispatchTechExtractJob(config, uid, repoFullName, githubToken, defaultBranch);
            } catch (err) {
                console.error('[tech-extractor] dispatch failed (non-fatal)', (err as Error).message);
            }

            return ctx.json({ status: 'queued', repoFullName, jobName }, 202);
        } catch (err) {
            await decrementQuota(pool, uid).catch(() => {});
            throw err;
        }
    });

    // -------------------------------------------------------------------------
    // POST /connected-repos/sync — dispatch ingestion Jobs for every repo the
    // caller queued via deferSync (status 'pending', never sync-triggered).
    // Quota is consumed here, at dispatch time — not at deferred connect.
    // Returns { started } = how many Jobs were actually dispatched.
    // -------------------------------------------------------------------------
    router.post('/connected-repos/sync', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const conn = await getConnection(pool, uid);
        if (!conn?.installation_id) return ctx.json({ error: 'GitHub not connected' }, 400);

        const { rows: pending } = await pool.query<{ full_name: string; default_branch: string }>(
            `SELECT r.full_name, r.default_branch
             FROM repositories r
             JOIN repo_sync_state s
               ON s.user_id = r.user_id AND s.repo_full_name = r.full_name
             WHERE r.user_id = $1::uuid AND r.provider = 'github'
               AND s.sync_status = 'pending' AND s.last_sync_triggered_at IS NULL`,
            [uid],
        );
        if (pending.length === 0) return ctx.json({ started: 0 });

        const [appId, key] = requireGitHubConfig(config);
        const pendingPlanStatus    = await getUserPlanStatus(pool, uid);
        const pendingEffectivePlan = pendingPlanStatus?.effectivePlan ?? 'free';
        const pendingRole          = pendingPlanStatus?.role ?? null;
        const token = await generateInstallationToken(appId, key, conn.installation_id);
        const idMap = await buildRepoIdMap(token);
        const queued = await autoDispatchRepos(
            config, pool, uid, pendingEffectivePlan, pendingRole,
            pending.map(r => ({ full_name: r.full_name, default_branch: r.default_branch, github_repo_id: idMap.get(r.full_name) ?? null })),
            token, false,
        );

        return ctx.json({ started: queued.length });
    });

    // -------------------------------------------------------------------------
    // POST /connected-repos/mark-timed-out — mark stale pending/syncing repos
    // Called by the frontend when the 10-min polling timeout elapses without
    // a status change. Updates sync_status → 'error' so the UI reflects the
    // actual failure rather than showing 'pending' indefinitely.
    // -------------------------------------------------------------------------
    router.post('/connected-repos/mark-timed-out', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        let body: { repoFullNames?: unknown };
        try { body = await ctx.req.json(); }
        catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

        const repoFullNames = body.repoFullNames;
        if (!Array.isArray(repoFullNames) || repoFullNames.length === 0) {
            return ctx.json({ error: '"repoFullNames" must be a non-empty array' }, 400);
        }
        const names = repoFullNames.filter((n): n is string => typeof n === 'string');
        const invalid = names.filter((n) => !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(n));
        if (invalid.length > 0) {
            return ctx.json({ error: `Invalid repo names: ${invalid.join(', ')}` }, 400);
        }

        const result = await pool.query(
            `UPDATE repo_sync_state
             SET sync_status   = 'error',
                 error_message = $3
             WHERE user_id = $1::uuid
               AND repo_full_name = ANY($2::text[])
               AND sync_status IN ('pending', 'syncing')`,
            [uid, names, MSG_TIMED_OUT],
        );

        return ctx.json({ updated: result.rowCount ?? 0 });
    });

    // -------------------------------------------------------------------------
    // POST /connected-repos/:fullName/retry — re-dispatch a failed repo.
    // Re-running after a crashed/timed-out ingestion does NOT consume a new
    // -------------------------------------------------------------------------
    // GET /connected-repos/:fullName/sbom — CycloneDX 1.6 SBOM for a repo, built
    // from its deterministic technology_evidence (the tech-extractor lane).
    // RLS-scoped via withUser; :fullName is URL-encoded "owner%2Frepo".
    // -------------------------------------------------------------------------
    interface EvidenceSbomRow { raw_name: string; ecosystem: string | null; version: string | null; commit_sha: string }
    router.get('/connected-repos/:fullName/sbom', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const repoFullName = decodeURIComponent(ctx.req.param('fullName'));
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
            return ctx.json({ error: 'Invalid repo name' }, 400);
        }

        // Prefer the immutable github_repo_id (rename-safe) so a renamed repo's
        // evidence — written under its old full_name — is still found; fall back
        // to repo_full_name when the id isn't resolved yet.
        const githubRepoId = await lookupGithubRepoId(config, uid, repoFullName);
        const { rows } = githubRepoId !== null
            ? await pool.query<EvidenceSbomRow>(
                `SELECT DISTINCT raw_name, ecosystem, version, commit_sha
                   FROM technology_evidence
                  WHERE user_id = $1::uuid AND github_repo_id = $2`,
                [uid, githubRepoId],
            )
            : await pool.query<EvidenceSbomRow>(
                `SELECT DISTINCT raw_name, ecosystem, version, commit_sha
                   FROM technology_evidence
                  WHERE user_id = $1::uuid AND repo_full_name = $2`,
                [uid, repoFullName],
            );

        return ctx.json(bomFromEvidenceRows(repoFullName, rows));
    });

    // -------------------------------------------------------------------------
    // GET /connected-repos/:fullName/croissant — MLCommons Croissant 1.0 data
    // card for a repo's RAG knowledge base (the document_embeddings chunk
    // corpus). The RAG-domain counterpart to /sbom. RLS-scoped; rename-safe via
    // github_repo_id with repo_full_name fallback. :fullName is "owner%2Frepo".
    // -------------------------------------------------------------------------
    router.get('/connected-repos/:fullName/croissant', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const repoFullName = decodeURIComponent(ctx.req.param('fullName'));
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
            return ctx.json({ error: 'Invalid repo name' }, 400);
        }

        // Rename-safe key: prefer immutable github_repo_id, fall back to name.
        const githubRepoId = await lookupGithubRepoId(config, uid, repoFullName);
        const scopeCol = githubRepoId !== null ? 'github_repo_id' : 'repo_full_name';
        const scopeVal: number | string = githubRepoId !== null ? githubRepoId : repoFullName;
        const { rows } = await pool.query<CroissantAggregateRow>(
            `SELECT
                (SELECT count(*) FROM document_embeddings
                  WHERE user_id = $1::uuid AND ${scopeCol} = $2)::int AS record_count,
                (SELECT array_agg(DISTINCT sk) FROM document_embeddings d, unnest(d.skills) sk
                  WHERE d.user_id = $1::uuid AND d.${scopeCol} = $2) AS skills,
                (SELECT metadata->>'commit_sha' FROM document_embeddings
                  WHERE user_id = $1::uuid AND ${scopeCol} = $2 AND metadata ? 'commit_sha' LIMIT 1) AS commit_sha,
                (SELECT metadata->'lineage' FROM document_embeddings
                  WHERE user_id = $1::uuid AND ${scopeCol} = $2 AND metadata ? 'lineage' LIMIT 1) AS lineage`,
            [uid, scopeVal],
        );

        return ctx.json(croissantFromAggregate(repoFullName, rows[0]));
    });

    // -------------------------------------------------------------------------
    // monthly quota credit: the original dispatch already charged one, and the
    // pod failing is an infra event, not a user action. Resets the repo to
    // 'pending' and dispatches a fresh (force-reindex) Job.
    // -------------------------------------------------------------------------
    router.post('/connected-repos/:fullName/retry', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const conn = await getConnection(pool, uid);
        if (!conn?.installation_id) return ctx.json({ error: 'GitHub not connected' }, 400);

        const repoFullName = decodeURIComponent(ctx.req.param('fullName'));
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
            return ctx.json({ error: 'Invalid repo name' }, 400);
        }

        // The repo must already belong to the caller (it was charged once).
        const { rows } = await pool.query<{ full_name: string }>(
            `SELECT full_name FROM repositories
              WHERE user_id = $1::uuid AND provider = 'github' AND full_name = $2`,
            [uid, repoFullName],
        );
        if (!rows[0]) return ctx.json({ error: 'Repository not connected' }, 404);

        const [appId, key] = requireGitHubConfig(config);

        // Resolve plan + role for enrichment depth (server-side, same as add-repo path).
        const retryPlanStatus    = await getUserPlanStatus(pool, uid);
        const retryEffectivePlan = retryPlanStatus?.effectivePlan ?? 'free';
        const retryRole          = retryPlanStatus?.role ?? null;

        // Double-click guard: two retries racing would dispatch two Jobs that
        // race document_embeddings writes. The atomic claim makes the loser a
        // no-op. Retry charges no new quota, so there is nothing to refund.
        if (!(await tryClaimSyncSlot(pool, uid, repoFullName))) {
            return ctx.json({ status: 'already_running', repoFullName, jobName: null }, 200);
        }
        await markSyncTriggered(pool, uid, repoFullName);

        const token = await generateInstallationToken(appId, key, conn.installation_id);
        const { jobName } = await dispatchIngestionJob(config, uid, repoFullName, token, true, retryEffectivePlan, retryRole);

        try {
            // A user-initiated retry/re-sync force-re-extracts (parity with the
            // ingestion force above), so new lanes backfill the current commit.
            await dispatchTechExtractJob(config, uid, repoFullName, token, undefined, true);
        } catch (err) {
            console.error('[tech-extractor] dispatch failed (non-fatal)', (err as Error).message);
        }

        return ctx.json({ status: 'queued', repoFullName, jobName }, 202);
    });

    // -------------------------------------------------------------------------
    // PATCH /connected-repos/:fullName/featured — toggle "use in resume"
    // :fullName is URL-encoded "owner%2Frepo" (same convention as DELETE)
    // -------------------------------------------------------------------------
    router.patch('/connected-repos/:fullName/featured', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const repoFullName = decodeURIComponent(ctx.req.param('fullName'));
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
            return ctx.json({ error: 'Invalid repo name' }, 400);
        }

        let body: { useInResume?: unknown };
        try { body = await ctx.req.json(); }
        catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }
        if (typeof body.useInResume !== 'boolean') {
            return ctx.json({ error: '"useInResume" must be a boolean' }, 400);
        }
        const useInResume = body.useInResume;

        const sql = useInResume
            ? `UPDATE repository_profiles
                  SET is_featured = TRUE,
                      feature_rank = COALESCE(
                        (SELECT MAX(feature_rank) + 1 FROM repository_profiles
                          WHERE user_id = $1::uuid AND is_featured = TRUE), 0)
                WHERE user_id = $1::uuid AND repo_full_name = $2
            RETURNING feature_rank`
            : `UPDATE repository_profiles
                  SET is_featured = FALSE, feature_rank = NULL
                WHERE user_id = $1::uuid AND repo_full_name = $2
            RETURNING feature_rank`;

        const { rows, rowCount } = await pool.query<{ feature_rank: number | null }>(
            sql, [uid, repoFullName],
        );
        if (!rowCount) return ctx.json({ error: 'Profile not found for repo' }, 404);

        return ctx.json({
            repoFullName,
            isFeatured:  useInResume,
            featureRank: rows[0]?.feature_rank ?? null,
        });
    });

    // -------------------------------------------------------------------------
    // DELETE /connected-repos/:fullName — remove repo + all KB data
    // :fullName is URL-encoded "owner%2Frepo"
    // -------------------------------------------------------------------------
    router.delete('/connected-repos/:fullName', async (ctx) => {
        const pool        = getPool(config);
        const uid         = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const repoFullName = decodeURIComponent(ctx.req.param('fullName'));

        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
            return ctx.json({ error: 'Invalid repo name' }, 400);
        }

        await deleteRepository(pool, uid, repoFullName);
        // Refresh the profile rollup so the removed repo drops out of the
        // aggregate now, not lazily on the next sync. Best-effort, non-blocking.
        void dispatchRollupRefresh(config, uid, 'repo delete');
        return ctx.json({ success: true });
    });


    return router;
}
