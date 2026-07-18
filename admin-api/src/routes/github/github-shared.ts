/**
 * @format
 * admin-api — GitHub route-private shared helpers.
 *
 * DB row helpers, quota enforcement, ingestion Job dispatch and
 * stuck-repo reconciliation shared by the installation, connected-repos and
 * webhook routers. Route-private: nothing outside src/routes/github should
 * import this module (deleteConnection lives in lib/github/connection.ts).
 *
 * Quota model:
 *   Free plan: 3 ingestion jobs per calendar month ('ingestion_jobs' feature in usage_quotas).
 *   Pro plan: unlimited.
 *   All three dispatch paths (POST /installation auto-sync, POST /connected-repos,
 *   and push webhook) enforce the same quota via checkAndIncrementQuota().
 */

import type { Pool } from 'pg';

import type { AdminApiConfig } from '../../lib/config.js';
import { getJobImage, isImageConfigured } from '../../lib/config.js';
import { listInstallationRepos } from '../../lib/github/github-app.js';
import type { V1Job } from '@kubernetes/client-node';
import { getBatchApi, getCoreApi } from '../../lib/jobs/k8s.js';
import { buildIngestionJobSpec, buildIngestionTokenSecret, ingestionTokenSecretName } from '../../lib/jobs/ingestion-job.js';
import { getPool } from '../../lib/pg.js';
import { ensureDefaultProject, cleanupOrphanedDefaultProjects, stampProjectIntent } from '../../lib/repositories/projects.js';
import type { ProjectIntent } from '../../lib/repositories/projects.js';
import type { EffectivePlan } from '../../lib/repositories/users.js';
import { entitlementsFromConfig } from '../../lib/billing/entitlements.js';
import { getCachedTierConfig } from '../../lib/billing/tier-config-cache.js';
import type { TierConfig } from '../../lib/billing/tier-config-shape.js';

// Push events: skip re-index if a job was already triggered within this window.
export const PUSH_COOLDOWN_MS = 30 * 60 * 1000;

// =============================================================================
// DB HELPERS — all queries are scoped to userId (users.id UUID)
// =============================================================================

interface OAuthRow {
    installation_id: string | null;
    username:        string;
    avatar_url:      string | null;
    connected_at:    Date;
}

export async function getConnection(pool: Pool, userId: string): Promise<OAuthRow | null> {
    const { rows } = await pool.query<OAuthRow>(
        `SELECT installation_id, username, avatar_url, connected_at
         FROM oauth_connections
         WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
    );
    return rows[0] ?? null;
}

export async function countConnectedRepos(pool: Pool, userId: string): Promise<number> {
    const { rows } = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM repositories
         WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
    );
    return Number(rows[0]?.n ?? '0');
}

export async function upsertConnection(
    pool: Pool,
    userId: string,
    accountId: string,
    installationId: string,
    username: string,
    avatarUrl: string,
): Promise<void> {
    await pool.query(
        `INSERT INTO oauth_connections
           (user_id, provider, provider_user_id, username, access_token_enc, installation_id, avatar_url)
         VALUES ($1::uuid, 'github', $2, $3, '', $4, $5)
         ON CONFLICT (user_id, provider)
         DO UPDATE SET
           provider_user_id = EXCLUDED.provider_user_id,
           installation_id  = EXCLUDED.installation_id,
           username         = EXCLUDED.username,
           avatar_url       = EXCLUDED.avatar_url,
           connected_at     = NOW()`,
        [userId, accountId, username, installationId, avatarUrl],
    );
}

interface ConnectedRepoRow {
    full_name:          string;
    default_branch:     string;
    index_status:       string;
    added_at:           Date;
    sync_status:        string | null;
    last_synced_at:     Date | null;
    last_sync_triggered_at: Date | null;
    file_count:         number | null;
    chunk_count:        number | null;
    embedded_count:     number | null;
    embed_total:        number | null;
    phase:              string | null;
    phase_done:         number | null;
    phase_total:        number | null;
    error_message:      string | null;
    // profile fields — all nullable (LEFT JOIN; no profile yet = nulls)
    quality_score:      number | null;
    quality_breakdown:  Record<string, number> | null;
    classification:     string | null;
    extraction_status:  string | null;
    one_liner:          string | null;
    domain:             string | null;
    tech_stack:         string[] | null;
    complexity:         string | null;
    confidence:         number | null;
    highlights:         string[] | null;
    is_featured:        boolean | null;
    feature_rank:       number | null;
    is_hidden:          boolean | null;
}

export async function listConnectedRepos(pool: Pool, userId: string): Promise<ConnectedRepoRow[]> {
    const { rows } = await pool.query<ConnectedRepoRow>(
        `SELECT r.full_name, r.default_branch, r.index_status, r.added_at,
                s.sync_status, s.last_synced_at, s.last_sync_triggered_at,
                s.file_count,
                -- chunk_count in repo_sync_state is a per-run snapshot: an
                -- incremental sync overwrites it with only the changed-file
                -- delta, so it under-reports large repos. Prefer the live
                -- cumulative count from the vector store (same source as the
                -- KB Health panel), falling back to the snapshot if no rows.
                -- Joined on github_repo_id (the stable key post repo-rename
                -- re-key) so a renamed repo still matches its embeddings.
                COALESCE(de.chunks, s.chunk_count)    AS chunk_count,
                s.embedded_count, s.embed_total,
                s.phase, s.phase_done, s.phase_total, s.error_message,
                p.quality_score, p.quality_breakdown, p.classification, p.extraction_status,
                p.extracted->>'one_liner'             AS one_liner,
                p.extracted->>'domain'                AS domain,
                p.extracted->'tech_stack'             AS tech_stack,
                p.extracted->>'complexity'            AS complexity,
                (p.extracted->>'confidence')::float   AS confidence,
                p.extracted->'highlights'             AS highlights,
                p.is_featured                         AS is_featured,
                p.feature_rank                        AS feature_rank,
                p.is_hidden                           AS is_hidden
         FROM repositories r
         LEFT JOIN repo_sync_state s
           ON s.user_id = r.user_id AND s.repo_full_name = r.full_name
         LEFT JOIN repository_profiles p
           ON p.user_id = r.user_id AND p.repo_full_name = r.full_name
         LEFT JOIN (
             SELECT github_repo_id, COUNT(*)::int AS chunks
               FROM document_embeddings
              WHERE user_id = $1::uuid AND github_repo_id IS NOT NULL
              GROUP BY github_repo_id
         ) de ON de.github_repo_id = r.github_repo_id
         WHERE r.user_id = $1::uuid AND r.provider = 'github'
         ORDER BY r.added_at DESC`,
        [userId],
    );
    return rows;
}

/**
 * Insert the repositories row AND its default single_repo project in one
 * transaction. Fatal-by-design: if project creation fails, the repo insert
 * rolls back too (a repo with no project is the bug we're preventing).
 * Uses the superuser pool (these tables are written without RLS today).
 *
 * Conflict is keyed on the immutable (user_id, github_repo_id) — the post-085
 * unique index uq_repositories_user_ghid. github_repo_id is NOT NULL after 085,
 * so every caller MUST resolve a real numeric id before connecting; a NULL would
 * be rejected by the DB. On a reconnect after a GitHub rename (same id, new
 * full_name) this correctly updates the stored full_name. github_repo_id itself
 * is never updated here — it IS the conflict key.
 */
export async function connectRepoWithDefaultProject(
    pool: Pool,
    userId: string,
    fullName: string,
    defaultBranch: string,
    githubRepoId: number,
    intent?: ProjectIntent,
): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
        const r = await client.query<{ id: string }>(
            `INSERT INTO repositories (user_id, provider, full_name, default_branch, index_status, github_repo_id)
             VALUES ($1::uuid, 'github', $2, $3, 'pending', $4)
             ON CONFLICT (user_id, github_repo_id)
             DO UPDATE SET full_name = EXCLUDED.full_name
             RETURNING id`,
            [userId, fullName, defaultBranch, githubRepoId],
        );
        const repoId = r.rows[0]!.id;
        await ensureDefaultProject(client, userId, repoId, fullName);
        if (intent) await stampProjectIntent(client, userId, repoId, intent);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

export async function markRepoPending(pool: Pool, userId: string, fullName: string): Promise<void> {
    await pool.query(
        `INSERT INTO repo_sync_state (user_id, repo_full_name, sync_status)
         VALUES ($1::uuid, $2, 'pending')
         ON CONFLICT (user_id, repo_full_name)
         DO UPDATE SET sync_status = 'pending', error_message = NULL`,
        [userId, fullName],
    );
}

export async function deleteRepository(pool: Pool, userId: string, fullName: string): Promise<void> {
    // Capture the projects this repo seeds BEFORE removing it, so we can clean up
    // a single-repo default left orphaned by the removal. Multi-repo clusters are
    // NOT affected: cleanupOrphanedDefaultProjects only deletes pristine
    // single_repo, unconfirmed, no-case-study projects with zero remaining repos.
    const { rows: projRows } = await pool.query<{ project_id: string }>(
        `SELECT DISTINCT pc.project_id
           FROM repositories r
           JOIN project_repositories pr ON pr.repository_id = r.id
           JOIN project_components   pc ON pr.project_component_id = pc.id
          WHERE r.user_id = $1::uuid AND r.full_name = $2`,
        [userId, fullName],
    );
    const seededProjectIds = projRows.map((r) => r.project_id);

    await pool.query(
        `DELETE FROM document_embeddings WHERE user_id = $1::uuid AND repo_full_name = $2`,
        [userId, fullName],
    );
    await pool.query(
        `DELETE FROM repo_sync_state WHERE user_id = $1::uuid AND repo_full_name = $2`,
        [userId, fullName],
    );
    await pool.query(
        `DELETE FROM repositories
         WHERE user_id = $1::uuid AND provider = 'github' AND full_name = $2`,
        [userId, fullName],
    );

    const removedProjects = await cleanupOrphanedDefaultProjects(pool, userId, seededProjectIds);
    if (removedProjects.length > 0) {
        console.log(`[github] removed ${removedProjects.length} orphaned single-repo default project(s) after deleting ${fullName}`);
    }
}

// =============================================================================
// QUOTA + DEBOUNCE HELPERS
// =============================================================================

export function getPlanLimit(config: TierConfig, plan: EffectivePlan, role: string | null | undefined): number {
    return entitlementsFromConfig(config, plan, role).ingestionJobsPerMonth;
}

/**
 * Atomically checks and increments the monthly ingestion job counter.
 * Returns true if the job is allowed (quota not exceeded), false otherwise.
 * Pro plan bypasses the check entirely.
 *
 * Uses a single INSERT … ON CONFLICT DO UPDATE … WHERE count < limit RETURNING count
 * so the check and increment are one atomic operation with no TOCTOU window.
 * If RETURNING yields no rows, the WHERE guard rejected the update → quota full.
 */
export async function checkAndIncrementQuota(
    pool: Pool,
    userId: string,
    limit: number,
): Promise<boolean> {
    if (!isFinite(limit)) return true;

    const { rows } = await pool.query<{ count: number }>(
        `INSERT INTO usage_quotas (user_id, feature, period_month, count)
         VALUES ($1::uuid, 'ingestion_jobs', DATE_TRUNC('month', NOW()), 1)
         ON CONFLICT (user_id, feature, period_month)
         DO UPDATE SET count      = usage_quotas.count + 1,
                       updated_at = NOW()
         WHERE usage_quotas.count < $2
         RETURNING count`,
        [userId, limit],
    );
    // Empty RETURNING → WHERE clause was false → quota already at or above limit.
    return rows.length > 0;
}

/**
 * Decrements the monthly ingestion counter by 1 (floor 0).
 * Called when a job dispatch fails after the quota was already incremented,
 * so a failed attempt doesn't consume a monthly credit.
 */
export async function decrementQuota(pool: Pool, userId: string): Promise<void> {
    await pool.query(
        `UPDATE usage_quotas
         SET count      = GREATEST(count - 1, 0),
             updated_at = NOW()
         WHERE user_id = $1::uuid AND feature = 'ingestion_jobs'
           AND period_month = DATE_TRUNC('month', NOW())`,
        [userId],
    );
}

/**
 * Stamp last_sync_triggered_at on a repo so the push cooldown is enforced.
 * Called immediately before dispatching any ingestion job.
 */
export async function markSyncTriggered(
    pool: Pool,
    userId: string,
    repoFullName: string,
): Promise<void> {
    await pool.query(
        `UPDATE repo_sync_state
         SET last_sync_triggered_at = NOW()
         WHERE user_id = $1::uuid AND repo_full_name = $2`,
        [userId, repoFullName],
    );
}

/**
 * Resolve user_id (users.id UUID) and plan from a GitHub App installation_id.
 * Used by the webhook handler which has no Cognito JWT to pull user context from.
 */
export async function lookupUserByInstallation(
    pool: Pool,
    installationId: string,
): Promise<{ userId: string; plan: string } | null> {
    const { rows } = await pool.query<{ user_id: string; plan: string }>(
        `SELECT oc.user_id::text, u.plan
         FROM oauth_connections oc
         JOIN users u ON u.id = oc.user_id
         WHERE oc.provider = 'github' AND oc.installation_id = $1`,
        [installationId],
    );
    const row = rows[0];
    return row ? { userId: row.user_id, plan: row.plan } : null;
}

/**
 * Dispatch ingestion Jobs for a list of repos, respecting the user's plan quota.
 * Stops as soon as the quota is exhausted — does not wrap around to the next month.
 *
 * forceReindex=true on re-installs so the full index is rebuilt even for repos
 * whose content_hashes are already in RDS.
 */
export async function autoDispatchRepos(
    config:        AdminApiConfig,
    pool:          Pool,
    userId:        string,
    effectivePlan: EffectivePlan,
    role:          string | null | undefined,
    repos:         Array<{ full_name: string; default_branch: string; github_repo_id?: number | null }>,
    token:         string,
    forceReindex:  boolean,
): Promise<string[]> {
    const tierConfig = await getCachedTierConfig(pool);
    const limit   = getPlanLimit(tierConfig, effectivePlan, role);
    const queued: string[] = [];
    // github_repo_id is NOT NULL post-085, so we must resolve a real id for every
    // repo. Build the installation name->id map once and fall back to it whenever
    // the row's id is absent.
    const idMap = await buildRepoIdMap(token);

    // Per-plan repository-count cap: free users auto-connecting many repos on
    // install are limited to `repos` entitlement (e.g. 1 for free tier).
    const repoCap = entitlementsFromConfig(tierConfig, effectivePlan, role).repos;
    const capped  = Number.isFinite(repoCap) ? repos.slice(0, repoCap) : repos;
    if (capped.length < repos.length) {
        console.log(`[github] plan cap: dispatching ${capped.length}/${repos.length} repos for ${userId}`);
    }

    for (const repo of capped) {
        const id = repo.github_repo_id ?? idMap.get(repo.full_name);
        if (id === null || id === undefined) {
            console.warn(`[github/auto-dispatch] no github_repo_id for ${repo.full_name} — skipping`);
            continue;
        }

        const allowed = await checkAndIncrementQuota(pool, userId, limit);
        if (!allowed) {
            console.log(`[github/auto-dispatch] quota reached for user ${userId} — stopping`);
            break;
        }

        await connectRepoWithDefaultProject(pool, userId, repo.full_name, repo.default_branch ?? 'main', id);
        await markRepoPending(pool, userId, repo.full_name);
        await markSyncTriggered(pool, userId, repo.full_name);

        try {
            await dispatchIngestionJob(config, userId, repo.full_name, token, forceReindex, effectivePlan, role);
            queued.push(repo.full_name);
            console.log(`[github/auto-dispatch] queued ${repo.full_name} (forceReindex=${forceReindex})`);
        } catch (err) {
            console.error(`[github/auto-dispatch] dispatch failed for ${repo.full_name}`, (err as Error).message);
            // Roll back the quota slot — this repo never got an active job.
            await decrementQuota(pool, userId).catch(() => {});
        }
    }

    return queued;
}

// =============================================================================
// JOB DISPATCH HELPER
// =============================================================================

const MAX_NAME_LEN = 63;
function sanitizeLabel(v: string): string {
    return v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_NAME_LEN);
}

/**
 * Look up the immutable numeric GitHub repo id persisted on the repositories row
 * (PR4 dual-writes it). Returns null when not yet backfilled — callers then omit
 * the GITHUB_REPO_ID env var entirely.
 */
export async function lookupGithubRepoId(
    config: AdminApiConfig,
    userId: string,
    repoFullName: string,
): Promise<number | null> {
    const pool = getPool(config);
    const r = await pool.query<{ github_repo_id: string | null }>(
        `SELECT github_repo_id FROM repositories
         WHERE user_id = $1::uuid AND provider = 'github' AND full_name = $2`,
        [userId, repoFullName],
    );
    const raw = r.rows[0]?.github_repo_id;
    if (raw === null || raw === undefined) return null;
    // pg returns bigint/int8 columns as strings; coerce and guard.
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) ? id : null;
}

export async function dispatchIngestionJob(
    config: AdminApiConfig,
    userId: string,
    repoFullName: string,
    githubToken: string,
    forceReindex = false,
    effectivePlan?: EffectivePlan,
    role?: string | null,
): Promise<{ jobName: string }> {
    const image = getJobImage('ingestion');
    if (!isImageConfigured(image)) {
        throw Object.assign(new Error('Ingestion image not yet configured'), { status: 502 });
    }

    const pool = getPool(config);

    // Resolve the immutable numeric repo id so the worker can re-key by id across
    // a rename. May be NULL pre-backfill — the builder then omits the env var.
    const githubRepoId = await lookupGithubRepoId(config, userId, repoFullName);

    // Fetch the live tier config so enrichment depth reflects DB-configured tiers
    // (60 s cache — effectively free). Falls back to static map on failure via
    // resolveEnrichmentEnv when tierConfig is null.
    const tierConfig = await getCachedTierConfig(pool);

    // Shared builder = single source of truth (same spec as the admin trigger).
    // Resync path adds the per-user GITHUB_TOKEN + argocd compare-options.
    const job = buildIngestionJobSpec(config, image, userId, repoFullName, forceReindex, Date.now(), {
        githubToken,
        githubRepoId,
        tierConfig,
        extraAnnotations: { 'argocd.argoproj.io/compare-options': 'IgnoreExtraneous' },
        ...(effectivePlan !== undefined ? { effectivePlan } : {}),
        ...(role          !== undefined ? { role }          : {}),
    });
    const jobName = job.metadata?.name ?? '';

    // Create the Job first, then its token Secret owned by the Job (for GC). The
    // pod can't start until the secret exists, but image pull (seconds) outlasts
    // the secret create (ms), so there's no real start delay. If the secret fails,
    // delete the now-unstartable Job so we never leak a stuck Job.
    const created = await getBatchApi().createNamespacedJob({ namespace: config.ingestionNamespace, body: job });
    const jobUid = created.metadata?.uid ?? '';
    try {
        await getCoreApi().createNamespacedSecret({
            namespace: config.ingestionNamespace,
            body: buildIngestionTokenSecret({
                secretName:   ingestionTokenSecretName(jobName),
                namespace:    config.ingestionNamespace,
                token:        githubToken,
                ownerJobName: jobName,
                ownerJobUid:  jobUid,
            }),
        });
    } catch (err) {
        await getBatchApi()
            .deleteNamespacedJob({ namespace: config.ingestionNamespace, name: jobName, propagationPolicy: 'Background' })
            .catch(() => { /* best-effort cleanup */ });
        throw err;
    }
    return { jobName };
}

// =============================================================================
// READ-TIME RECONCILIATION
// =============================================================================
//
// The ingestion pod writes its own terminal status (complete/error) — but only
// if it lives long enough to run its catch/finally. A hard kill (OOMKilled,
// activeDeadlineSeconds exceeded, node eviction, image-pull failure) leaves
// repo_sync_state stuck at 'pending'/'syncing' forever. This makes the DB
// authoritative by consulting the live K8s Job state whenever the UI reads
// status, independent of any browser staying open. The platform-job-watcher
// sweep is the second, fully server-side line of defence.

export const ACTIVE_SYNC_STATUSES = new Set(['pending', 'syncing']);

// An ingestion Job's deadline is 900s and its finished-Job TTL is 3600s. If a
// repo has been triggered longer ago than this and has no live Job, the Job
// terminally failed and was already garbage-collected → treat as errored.
const ORPHAN_GRACE_MS = 20 * 60 * 1_000;
const REPO_FULL_NAME_ANNOTATION = 'ingestion.tucaken.io/repo-full-name';

interface StuckRepo {
    readonly fullName:           string;
    readonly lastSyncTriggeredAt: Date | null;
}

function jobCreatedAtMs(job: V1Job): number {
    const ts = job.metadata?.creationTimestamp;
    return ts ? new Date(ts).getTime() : 0;
}

// User-facing copy — no internal reason codes (BackoffLimitExceeded, etc.) or
// K8s/job vocabulary leaks to the customer. The reason is kept in logs only.
export const MSG_TIMED_OUT = "Indexing took too long and didn't finish. Please try again.";
const MSG_FAILED    = "Indexing didn't finish for this repository. Please try again.";

/** User-facing failure message for a Job whose `Failed` condition is True. */
function failureMessageFor(job: V1Job): string {
    const cond = job.status?.conditions?.find((c) => c.type === 'Failed' && c.status === 'True');
    if (!cond) return '';
    return cond.reason === 'DeadlineExceeded' ? MSG_TIMED_OUT : MSG_FAILED;
}

/**
 * For repos still in an active state, consult the live K8s Job and flip any
 * terminally-failed (or orphaned-past-grace) repo to 'error' in the DB.
 * Best-effort: a K8s API failure leaves status untouched (the sweep covers it)
 * and never propagates into the request path. Returns the repos transitioned.
 */
export async function reconcileStuckRepos(
    config: AdminApiConfig,
    pool:   Pool,
    userId: string,
    stuck:  readonly StuckRepo[],
): Promise<Set<string>> {
    const transitioned = new Set<string>();
    if (stuck.length === 0) return transitioned;

    let jobs: V1Job[];
    try {
        const safeUser = sanitizeLabel(userId);
        const res = await getBatchApi().listNamespacedJob({
            namespace:     config.ingestionNamespace,
            labelSelector: `app=ingestion-worker,userId=${safeUser}`,
        });
        jobs = res.items ?? [];
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[github/reconcile] listNamespacedJob failed — deferring to sweep', msg);
        return transitioned;
    }

    // repo_full_name → most recent Job (a repo can be re-dispatched many times).
    const latestByRepo = new Map<string, V1Job>();
    for (const job of jobs) {
        const repo = job.metadata?.annotations?.[REPO_FULL_NAME_ANNOTATION];
        if (!repo) continue;
        const prev = latestByRepo.get(repo);
        if (!prev || jobCreatedAtMs(job) >= jobCreatedAtMs(prev)) latestByRepo.set(repo, job);
    }

    const now = Date.now();
    for (const repo of stuck) {
        const job = latestByRepo.get(repo.fullName);
        let errorMessage = '';

        if (job) {
            errorMessage = failureMessageFor(job);
        } else if (repo.lastSyncTriggeredAt) {
            // No live Job. Past the grace window means it died and was GC'd.
            const age = now - repo.lastSyncTriggeredAt.getTime();
            if (age > ORPHAN_GRACE_MS) {
                errorMessage = MSG_FAILED;
            }
        }

        if (!errorMessage) continue;

        const result = await pool.query(
            `UPDATE repo_sync_state
                SET sync_status = 'error', error_message = $3
              WHERE user_id = $1::uuid AND repo_full_name = $2
                AND sync_status IN ('pending', 'syncing')`,
            [userId, repo.fullName, errorMessage],
        );
        if ((result.rowCount ?? 0) > 0) transitioned.add(repo.fullName);
    }
    return transitioned;
}

// =============================================================================
// ROUTER
// =============================================================================

/** Return [appId, privateKey] or throw 503. */
export function requireGitHubConfig(config: AdminApiConfig): [string, string] {
    const { githubAppId, githubPrivateKey } = config;
    if (!githubAppId || !githubPrivateKey) {
        throw Object.assign(
            new Error('GitHub App not configured — GITHUB_APP_ID / GITHUB_PRIVATE_KEY missing'),
            { status: 503 },
        );
    }
    return [githubAppId, githubPrivateKey];
}

/**
 * Build a `full_name -> immutable github_repo_id` lookup from the installation's
 * accessible repos. Used to dual-write the numeric id when (re-)connecting repos
 * whose only handle in scope is the mutable full name (DB rows / request body).
 */
export async function buildRepoIdMap(token: string): Promise<Map<string, number>> {
    const raw = await listInstallationRepos(token);
    const map = new Map<string, number>();
    for (const r of raw) {
        if (typeof r.full_name === 'string' && typeof r.id === 'number') {
            map.set(r.full_name, r.id);
        }
    }
    return map;
}
