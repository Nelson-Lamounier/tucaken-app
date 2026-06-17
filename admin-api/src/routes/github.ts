/**
 * @format
 * admin-api — GitHub App integration routes.
 *
 * All routes require a valid Cognito JWT. User isolation is enforced at two
 * layers: the DB schema (UNIQUE(user_id, provider) / UNIQUE(user_id, provider,
 * full_name) constraints) and every SQL query (user_id = $userId from users.id).
 *
 * Routes:
 *   GET    /github/installation              — check if GitHub App is installed
 *   POST   /github/installation              — store installation_id after redirect
 *   DELETE /github/installation              — disconnect + cascade-delete repos
 *   GET    /github/repos                     — list repos accessible via installation
 *   GET    /github/connected-repos           — list repos added to KB + sync status
 *   POST   /github/connected-repos           — add repo + write pending + trigger Job
 *   DELETE /github/connected-repos/:fullName — remove repo + embeddings
 *
 * Token model:
 *   Only installation_id is stored in oauth_connections (TEXT column).
 *   Installation tokens (1-hour, read-only) are generated on the fly from the
 *   App private key for repo listing and ingestion Job dispatch.
 *   No long-lived PAT is ever persisted.
 *
 * Quota model:
 *   Free plan: 3 ingestion jobs per calendar month ('ingestion_jobs' feature in usage_quotas).
 *   Pro plan: unlimited.
 *   All three dispatch paths (POST /installation auto-sync, POST /connected-repos,
 *   and push webhook) enforce the same quota via checkAndIncrementQuota().
 *
 * Push debounce:
 *   repo_sync_state.last_sync_triggered_at — skip push re-index if triggered
 *   within the last PUSH_COOLDOWN_MS (30 minutes) or if a job is already running.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';
import type { Pool } from 'pg';

import type { AdminApiConfig } from '../lib/config.js';
import { getJobImage, isImageConfigured } from '../lib/config.js';
import {
    deleteInstallation,
    generateInstallationToken,
    getInstallationInfo,
    listInstallationRepos,
    resolveHeadSha,
} from '../lib/github-app.js';
import type { V1EnvVar, V1Job } from '@kubernetes/client-node';
import { getBatchApi, getCoreApi } from '../lib/k8s.js';
import { traceParentEnv, observabilityEnv, MODEL_JOB_BACKOFF_LIMIT } from '../lib/k8s-job-builder.js';
import { buildIngestionJobSpec, buildIngestionTokenSecret, ingestionTokenSecretName } from '../lib/ingestion-job.js';
import { getPool } from '../lib/pg.js';
import { reconcileRepoName } from '../lib/reconcile-repo-name.js';
import { isSyncInFlight, tryClaimSyncSlot } from '../lib/sync-state.js';
import { ensureDefaultProject } from '../lib/repositories/projects.js';
import { secondsUntilNextMonthUTC } from '../lib/retry-after.js';
import { AdminApiBindings, requireUserId } from '../lib/types.js';

// Push events: skip re-index if a job was already triggered within this window.
const PUSH_COOLDOWN_MS = 30 * 60 * 1000;

// Free-tier monthly ingestion job cap.
const FREE_PLAN_LIMIT = 3;

// =============================================================================
// DB HELPERS — all queries are scoped to userId (users.id UUID)
// =============================================================================

interface OAuthRow {
    installation_id: string | null;
    username:        string;
    avatar_url:      string | null;
    connected_at:    Date;
}

async function getConnection(pool: Pool, userId: string): Promise<OAuthRow | null> {
    const { rows } = await pool.query<OAuthRow>(
        `SELECT installation_id, username, avatar_url, connected_at
         FROM oauth_connections
         WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
    );
    return rows[0] ?? null;
}

async function upsertConnection(
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

async function deleteConnection(pool: Pool, userId: string): Promise<void> {
    // Cascade: delete connected repos + their sync state + embeddings.
    // Ordering matters — FK-free tables first, then oauth_connections.
    await pool.query(
        `DELETE FROM document_embeddings
         WHERE user_id = $1::uuid
           AND repo_full_name IN (
             SELECT full_name FROM repositories WHERE user_id = $1::uuid AND provider = 'github'
           )`,
        [userId],
    );
    await pool.query(
        `DELETE FROM repo_sync_state
         WHERE user_id = $1::uuid
           AND repo_full_name IN (
             SELECT full_name FROM repositories WHERE user_id = $1::uuid AND provider = 'github'
           )`,
        [userId],
    );
    await pool.query(
        `DELETE FROM repositories WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
    );
    await pool.query(
        `DELETE FROM oauth_connections WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
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

async function listConnectedRepos(pool: Pool, userId: string): Promise<ConnectedRepoRow[]> {
    const { rows } = await pool.query<ConnectedRepoRow>(
        `SELECT r.full_name, r.default_branch, r.index_status, r.added_at,
                s.sync_status, s.last_synced_at, s.last_sync_triggered_at,
                s.file_count, s.chunk_count, s.embedded_count, s.embed_total,
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
): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
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
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function markRepoPending(pool: Pool, userId: string, fullName: string): Promise<void> {
    await pool.query(
        `INSERT INTO repo_sync_state (user_id, repo_full_name, sync_status)
         VALUES ($1::uuid, $2, 'pending')
         ON CONFLICT (user_id, repo_full_name)
         DO UPDATE SET sync_status = 'pending', error_message = NULL`,
        [userId, fullName],
    );
}

async function deleteRepository(pool: Pool, userId: string, fullName: string): Promise<void> {
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
}

// =============================================================================
// QUOTA + DEBOUNCE HELPERS
// =============================================================================

function getPlanLimit(plan: string): number {
    return plan === 'pro' ? Infinity : FREE_PLAN_LIMIT;
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
async function checkAndIncrementQuota(
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
async function decrementQuota(pool: Pool, userId: string): Promise<void> {
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
async function markSyncTriggered(
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
async function lookupUserByInstallation(
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
async function autoDispatchRepos(
    config:       AdminApiConfig,
    pool:         Pool,
    userId:       string,
    plan:         string,
    repos:        Array<{ full_name: string; default_branch: string; github_repo_id?: number | null }>,
    token:        string,
    forceReindex: boolean,
): Promise<string[]> {
    const limit   = getPlanLimit(plan);
    const queued: string[] = [];
    // github_repo_id is NOT NULL post-085, so we must resolve a real id for every
    // repo. Build the installation name->id map once and fall back to it whenever
    // the row's id is absent.
    const idMap = await buildRepoIdMap(token);

    for (const repo of repos) {
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
            await dispatchIngestionJob(config, userId, repo.full_name, token, forceReindex);
            queued.push(repo.full_name);
            console.log(`[github/auto-dispatch] queued ${repo.full_name} (forceReindex=${forceReindex})`);
        } catch (err) {
            console.error(`[github/auto-dispatch] dispatch failed for ${repo.full_name}`, (err as Error).message);
            // Roll back the quota slot — this repo never got an active job.
            await decrementQuota(pool, userId).catch(() => {});
        }
        try {
            await dispatchTechExtractJob(config, userId, repo.full_name, token, repo.default_branch ?? undefined);
        } catch (err) {
            console.error('[tech-extractor] dispatch failed (non-fatal)', (err as Error).message);
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
async function lookupGithubRepoId(
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

async function dispatchIngestionJob(
    config: AdminApiConfig,
    userId: string,
    repoFullName: string,
    githubToken: string,
    forceReindex = false,
): Promise<{ jobName: string }> {
    const image = getJobImage('ingestion');
    if (!isImageConfigured(image)) {
        throw Object.assign(new Error('Ingestion image not yet configured'), { status: 502 });
    }

    // Resolve the immutable numeric repo id so the worker can re-key by id across
    // a rename. May be NULL pre-backfill — the builder then omits the env var.
    const githubRepoId = await lookupGithubRepoId(config, userId, repoFullName);

    // Shared builder = single source of truth (same spec as the admin trigger).
    // Resync path adds the per-user GITHUB_TOKEN + argocd compare-options.
    const job = buildIngestionJobSpec(config, image, userId, repoFullName, forceReindex, Date.now(), {
        githubToken,
        githubRepoId,
        extraAnnotations: { 'argocd.argoproj.io/compare-options': 'IgnoreExtraneous' },
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

/**
 * Dispatch a tech-extractor K8s Job alongside the ingestion Job (shadow-mode).
 * This is additive — it MUST NEVER throw in a way that blocks ingestion.
 * Returns null (no throw) if the image is unconfigured.
 */
export async function buildTechExtractJobSpec(
    config:        AdminApiConfig,
    image:         string,
    userId:        string,
    repoFullName:  string,
    timestamp:     number,
    commitSha?:    string,
): Promise<V1Job> {
    const { createHash } = await import('node:crypto');
    const safeUser  = sanitizeLabel(userId);
    const repoSlug  = sanitizeLabel(repoFullName.replace('/', '-'));
    const suffix    = createHash('sha1').update(`${userId}:${repoFullName}:${timestamp}`).digest('hex').slice(0, 8);
    // 'tech-extract-' (13) + suffix (8) + 1 hyphen = 22 fixed chars; 41 left for slug
    const slugPart  = sanitizeLabel(`${safeUser}-${repoSlug}`).slice(0, 41);
    const jobName   = `tech-extract-${slugPart}-${suffix}`.slice(0, MAX_NAME_LEN);

    const env: V1EnvVar[] = [
        ...observabilityEnv('tech-extractor', `${userId}:${repoFullName}:${timestamp}`),
        { name: 'USER_ID',        value: userId },
        { name: 'REPO_FULL_NAME', value: repoFullName },
        { name: 'WORK_DIR',       value: '/work' },
        { name: 'GITHUB_TOKEN',   value: '' }, // overwritten by caller; placeholder keeps shape
        ...(() => { const tp = traceParentEnv(); return tp ? [tp] : []; })(),
    ];
    if (commitSha) {
        env.push({ name: 'COMMIT_SHA', value: commitSha });
    }

    return {
        apiVersion: 'batch/v1',
        kind:       'Job',
        metadata: {
            name:      jobName,
            namespace: config.techExtractorNamespace,
            labels: {
                app:      'tech-extractor',
                userId:   safeUser,
                repoSlug,
            },
            annotations: {
                'argocd.argoproj.io/compare-options':      'IgnoreExtraneous',
                'tech-extractor.tucaken.io/user-id':       userId,
                'tech-extractor.tucaken.io/repo-full-name': repoFullName,
            },
        },
        spec: {
            ttlSecondsAfterFinished: 3600,
            backoffLimit:            MODEL_JOB_BACKOFF_LIMIT,
            activeDeadlineSeconds:   1800,
            template: {
                metadata: { labels: { app: 'tech-extractor', userId: safeUser, repoSlug } },
                spec: {
                    restartPolicy:      'Never',
                    serviceAccountName: config.techExtractorServiceAccount,
                    volumes: [{ name: 'work', emptyDir: { sizeLimit: '2Gi' } }],
                    containers: [{
                        name:    'worker',
                        image,
                        command: ['node', 'dist/run-tech-extract.js'],
                        env,
                        envFrom: [
                            { secretRef: { name: 'platform-rds-credentials' } },
                            { secretRef: { name: 'tech-extractor-secrets' } },
                        ],
                        volumeMounts: [{ name: 'work', mountPath: '/work' }],
                    }],
                },
            },
        },
    };
}

async function dispatchTechExtractJob(
    config:        AdminApiConfig,
    userId:        string,
    repoFullName:  string,
    githubToken:   string,
    defaultBranch?: string,
): Promise<{ jobName: string } | null> {
    const image = getJobImage('tech-extractor');
    if (!isImageConfigured(image)) {
        console.warn('[tech-extractor] image not yet configured — skipping dispatch (non-fatal)');
        return null;
    }

    const timestamp = Date.now();

    // Resolve the HEAD commit sha so the Job can short-circuit on repeat runs.
    // On failure: log and omit COMMIT_SHA (do not throw).
    let commitSha: string | undefined;
    try {
        commitSha = await resolveHeadSha(githubToken, repoFullName, defaultBranch ?? 'HEAD');
    } catch (err) {
        console.warn('[tech-extractor] resolveHeadSha failed — omitting COMMIT_SHA', (err as Error).message);
    }

    const job = await buildTechExtractJobSpec(config, image, userId, repoFullName, timestamp, commitSha);

    // Stamp the real GITHUB_TOKEN into the env (buildTechExtractJobSpec uses a placeholder).
    const container = job.spec!.template.spec!.containers[0]!;
    const tokenIdx = container.env!.findIndex(e => e.name === 'GITHUB_TOKEN');
    if (tokenIdx >= 0) {
        container.env![tokenIdx]!.value = githubToken;
    } else {
        container.env!.push({ name: 'GITHUB_TOKEN', value: githubToken });
    }

    await getBatchApi().createNamespacedJob({ namespace: config.techExtractorNamespace, body: job });
    return { jobName: job.metadata!.name! };
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

const ACTIVE_SYNC_STATUSES = new Set(['pending', 'syncing']);

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
const MSG_TIMED_OUT = "Indexing took too long and didn't finish. Please try again.";
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
async function reconcileStuckRepos(
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
                SET sync_status = 'error', error_message = $3, updated_at = NOW()
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
function requireGitHubConfig(config: AdminApiConfig): [string, string] {
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
async function buildRepoIdMap(token: string): Promise<Map<string, number>> {
    const raw = await listInstallationRepos(token);
    const map = new Map<string, number>();
    for (const r of raw) {
        if (typeof r.full_name === 'string' && typeof r.id === 'number') {
            map.set(r.full_name, r.id);
        }
    }
    return map;
}

export function createGitHubRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    // -------------------------------------------------------------------------
    // Error boundary — consistent JSON error shape
    // -------------------------------------------------------------------------
    router.onError((err, ctx) => {
        const status = (err as { status?: number }).status ?? 500;
        console.error(`[github] ${ctx.req.method} ${ctx.req.path}`, err.message);
        return ctx.json({ error: err.message }, status as 400 | 401 | 403 | 404 | 500 | 502 | 503);
    });

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

        const { rows: planRows } = await pool.query<{ plan: string }>(
            `SELECT plan FROM users WHERE id = $1::uuid`,
            [uid],
        );
        const plan = planRows[0]?.plan ?? 'free';

        const idMap = await buildRepoIdMap(token);
        const queued = await autoDispatchRepos(
            config, pool, uid, plan,
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
        const stuck = rows
            .filter(r => ACTIVE_SYNC_STATUSES.has(r.sync_status ?? r.index_status))
            .map(r => ({ fullName: r.full_name, lastSyncTriggeredAt: r.last_sync_triggered_at }));
        if (stuck.length > 0) {
            const transitioned = await reconcileStuckRepos(config, pool, uid, stuck);
            if (transitioned.size > 0) rows = await listConnectedRepos(pool, uid);
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
    router.post('/connected-repos', async (ctx) => {
        const pool = getPool(config);
        const uid  = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const conn = await getConnection(pool, uid);
        if (!conn?.installation_id) return ctx.json({ error: 'GitHub not connected' }, 400);

        let body: { repoFullName?: string; defaultBranch?: string; forceReindex?: boolean; deferSync?: boolean };
        try { body = await ctx.req.json(); }
        catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

        const repoFullName = body.repoFullName?.trim();
        if (!repoFullName || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
            return ctx.json({ error: '"repoFullName" must match owner/repo' }, 400);
        }
        const defaultBranch = body.defaultBranch?.trim() || 'main';
        const forceReindex  = body.forceReindex === true;

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
            await connectRepoWithDefaultProject(pool, uid, repoFullName, defaultBranch, deferId);
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
        const { rows: planRows } = await pool.query<{ plan: string }>(
            `SELECT plan FROM users WHERE id = $1::uuid`,
            [uid],
        );
        const plan  = planRows[0]?.plan ?? 'free';
        const limit = getPlanLimit(plan);
        const allowed = await checkAndIncrementQuota(pool, uid, limit);
        if (!allowed) {
            ctx.header('Retry-After', String(secondsUntilNextMonthUTC()));
            return ctx.json({ error: `Monthly ingestion limit of ${FREE_PLAN_LIMIT} reached. Upgrade to Pro for unlimited syncs.` }, 429);
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
            await connectRepoWithDefaultProject(pool, uid, repoFullName, defaultBranch, id);

            // Race-free backstop: lost the atomic claim → a concurrent request
            // already dispatched between the fast-path read and here. Refund the
            // quota we just incremented and report the in-flight Job.
            if (!(await tryClaimSyncSlot(pool, uid, repoFullName))) {
                await decrementQuota(pool, uid).catch(() => {});
                return ctx.json({ status: 'already_running', repoFullName, jobName: null }, 200);
            }
            await markSyncTriggered(pool, uid, repoFullName);

            const { jobName } = await dispatchIngestionJob(config, uid, repoFullName, githubToken, forceReindex);

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
        const { rows: planRows } = await pool.query<{ plan: string }>(
            `SELECT plan FROM users WHERE id = $1::uuid`,
            [uid],
        );
        const plan  = planRows[0]?.plan ?? 'free';
        const token = await generateInstallationToken(appId, key, conn.installation_id);
        const idMap = await buildRepoIdMap(token);
        const queued = await autoDispatchRepos(
            config, pool, uid, plan,
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
                 error_message = $3,
                 updated_at    = NOW()
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

        // Double-click guard: two retries racing would dispatch two Jobs that
        // race document_embeddings writes. The atomic claim makes the loser a
        // no-op. Retry charges no new quota, so there is nothing to refund.
        if (!(await tryClaimSyncSlot(pool, uid, repoFullName))) {
            return ctx.json({ status: 'already_running', repoFullName, jobName: null }, 200);
        }
        await markSyncTriggered(pool, uid, repoFullName);

        const token = await generateInstallationToken(appId, key, conn.installation_id);
        const { jobName } = await dispatchIngestionJob(config, uid, repoFullName, token, true);

        try {
            await dispatchTechExtractJob(config, uid, repoFullName, token);
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
        return ctx.json({ success: true });
    });

    return router;
}

// =============================================================================
// WEBHOOK ROUTER — unauthenticated, mounted outside /api/admin/*
// =============================================================================

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
                        const token = await generateInstallationToken(appId, key, installationId);
                        const idMap = await buildRepoIdMap(token);
                        const queued = await autoDispatchRepos(
                            config, pool, user.userId, user.plan,
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

            // Quota check
            const limit   = getPlanLimit(user.plan);
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
                );
                console.log(`[github/webhook] push re-index queued for ${repoFullName}: job=${jobName}`);
            } catch (err) {
                console.error(`[github/webhook] push dispatch failed for ${repoFullName}`, (err as Error).message);
            }

            try {
                await dispatchTechExtractJob(config, user.userId, repoFullName, token);
            } catch (err) {
                console.error('[tech-extractor] dispatch failed (non-fatal)', (err as Error).message);
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

            try {
                await reconcileRepoName(pool, user.userId, githubRepoId, newFullName);
                console.log(`[github/webhook] repository.${action}: reconciled repo ${githubRepoId} -> ${newFullName} for user ${user.userId}`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[github/webhook] reconcile failed for repo ${githubRepoId}`, msg);
            }
            return ctx.json({ ok: true });
        }

        // ── 8. All other events — acknowledge without processing ──────────────
        return ctx.json({ ok: true });
    });

    return router;
}
