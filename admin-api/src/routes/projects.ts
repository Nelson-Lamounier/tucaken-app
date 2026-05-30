/**
 * @format
 * admin-api — Projects domain routes (Phase 3a + 3b).
 *
 * User-scoped reads, user-edit writes, plus K8s Job dispatch endpoints
 * for the clustering and case-study services. Routes follow the same
 * RLS pattern as the rest of admin-api: every DB read/write is wrapped
 * in `withUser(pool, userId, fn)` so the connection runs as
 * `tucaken_app` with `app.current_user_id` set.
 *
 * Job dispatch (Phase 3b):
 *   - POST /clustering/run            — fire-and-forget clustering Job
 *                                       (queues one row in pipeline_runs
 *                                       type='clustering', creates K8s Job
 *                                       running `node dist/run-clustering.js`)
 *   - POST /:id/regenerate            — case-study Job for a confirmed
 *                                       project. Resets case_study_status
 *                                       to 'pending', requests a fresh
 *                                       GitHub installation token (case
 *                                       study mines commits), dispatches
 *                                       `node dist/run-case-study.js`.
 *
 * Routes (all mounted under `/api/admin/projects/`):
 *
 *   GET    /                         — list user's projects (paginated;
 *                                       ?includeArchived=true, ?proposalsOnly=true)
 *   GET    /clustering/proposals     — list current unconfirmed AI proposals
 *   POST   /                         — create a project manually
 *   GET    /:id                      — full project detail with case study
 *   PATCH  /:id                      — update name / pitch / status /
 *                                       visibility / user_overrides
 *   DELETE /:id                      — soft delete (status='archived')
 *   POST   /:id/confirm              — confirm an AI-suggested grouping
 *                                       (Job dispatch for case-study lands in 3b)
 *
 *   GET    /:id/decisions            — list decisions
 *   PATCH  /:id/decisions/:did       — edit / confirm a decision
 *   DELETE /:id/decisions/:did       — remove a decision
 *
 *   GET    /:id/architecture         — Mermaid source
 *   PATCH  /:id/architecture         — user edits (sets is_user_edited=true)
 *
 *   POST   /merge                    — merge sources into a target
 *   POST   /:id/split                — split components into a new project
 *
 * RLS enforcement: every DB call runs inside `withUser(pool, userId, fn)`
 * so the connection runs as the low-privilege `tucaken_app` role with
 * `app.current_user_id` set to the caller's users.id UUID.
 */
import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import type { Pool } from 'pg';

import { getJobImage, isImageConfigured, type AdminApiConfig } from '../lib/config.js';
import { generateInstallationToken } from '../lib/github-app.js';
import { buildPipelineJob, sanitizeLabel } from '../lib/k8s-job-builder.js';
import { getBatchApi } from '../lib/k8s.js';
import { getPool, withUser } from '../lib/pg.js';
import { invalidateProject } from '../lib/redis-cache.js';
import { insertPipelineRun } from '../lib/repositories/pipeline-runs.js';
import {
    archiveProject,
    archiveSupersededDefaults,
    createProject,
    deleteDecision,
    getProjectDetail,
    listProjects,
    mergeProjects,
    patchArchitecture,
    patchDecision,
    patchProject,
    splitProject,
} from '../lib/repositories/projects.js';
import { AdminApiBindings, requireUserId } from '../lib/types.js';

const VALID_TYPES        = new Set(['side_project', 'open_source', 'production_saas', 'client_work', 'internal_tool', 'learning_project']);
const VALID_STATUSES     = new Set(['active', 'stable', 'dormant', 'archived']);
const VALID_VISIBILITIES = new Set(['private', 'unlisted', 'public']);
const VALID_ROLES        = new Set(['sole_builder', 'lead', 'contributor', 'maintainer']);
const VALID_CONFIDENCE   = new Set(['high', 'medium', 'low']);

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

function isUuid(value: unknown): value is string {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parsePositiveInt(input: string | undefined, fallback: number, max: number): number {
    if (!input) return fallback;
    const n = Number.parseInt(input, 10);
    if (Number.isNaN(n) || n < 0) return fallback;
    return Math.min(n, max);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalise a nullable text patch field: null → null, string → string, else undefined. */
function nullableString(value: unknown): string | null | undefined {
    if (value === null) return null;
    return typeof value === 'string' ? value : undefined;
}

/** True when `value` is a string that belongs to the allowed set. */
function isValidOption(allowed: Set<string>, value: unknown): boolean {
    return typeof value === 'string' && allowed.has(value);
}

export function createProjectsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    router.onError((err, ctx) => {
        const status = (err as { status?: number }).status ?? 500;
        console.error(`[projects] ${ctx.req.method} ${ctx.req.path}`, err.message);
        return ctx.json({ error: err.message }, status as 400 | 401 | 403 | 404 | 500);
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /                                — list projects
    // ────────────────────────────────────────────────────────────────────
    router.get('/', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const url             = new URL(ctx.req.url);
        const limit           = parsePositiveInt(url.searchParams.get('limit')  ?? undefined, 25, 100);
        const offset          = parsePositiveInt(url.searchParams.get('offset') ?? undefined, 0, 10_000);
        const includeArchived = url.searchParams.get('includeArchived') === 'true';
        const proposalsOnly   = url.searchParams.get('proposalsOnly')   === 'true';

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            listProjects(db, { limit, offset, includeArchived, proposalsOnly }),
        );
        return ctx.json({
            total:  result.total,
            limit,
            offset,
            items:  result.rows,
        });
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /clustering/proposals             — unconfirmed AI proposals
    // ────────────────────────────────────────────────────────────────────
    router.get('/clustering/proposals', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            listProjects(db, { limit: 100, offset: 0, includeArchived: false, proposalsOnly: true }),
        );
        return ctx.json({ items: result.rows });
    });

    // ────────────────────────────────────────────────────────────────────
    // POST /                                — create a project manually
    // ────────────────────────────────────────────────────────────────────
    router.post('/', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;

        const slug = input.slug;
        const name = input.name;
        if (typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
            return ctx.json({ error: 'slug must match ^[a-z0-9-]+$ (1-80 chars)' }, 400);
        }
        if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
            return ctx.json({ error: 'name must be 1-200 chars' }, 400);
        }
        if (input.type           !== undefined && !isValidOption(VALID_TYPES, input.type))                return ctx.json({ error: 'invalid type' }, 400);
        if (input.status         !== undefined && !isValidOption(VALID_STATUSES, input.status))           return ctx.json({ error: 'invalid status' }, 400);
        if (input.visibility     !== undefined && !isValidOption(VALID_VISIBILITIES, input.visibility))   return ctx.json({ error: 'invalid visibility' }, 400);
        if (input.role_exhibited !== undefined && !isValidOption(VALID_ROLES, input.role_exhibited))      return ctx.json({ error: 'invalid role_exhibited' }, 400);

        const pool = getPool(config);
        try {
            const created = await withUser(pool, uid, async (db) =>
                createProject(db, uid, {
                    slug,
                    name,
                    tagline:        typeof input.tagline === 'string' ? input.tagline : undefined,
                    pitch:          typeof input.pitch   === 'string' ? input.pitch   : undefined,
                    type:           typeof input.type           === 'string' ? input.type           : undefined,
                    shape:          typeof input.shape          === 'string' ? input.shape          : undefined,
                    status:         typeof input.status         === 'string' ? input.status         : undefined,
                    role_exhibited: typeof input.role_exhibited === 'string' ? input.role_exhibited : undefined,
                    visibility:     typeof input.visibility     === 'string' ? input.visibility     : undefined,
                }),
            );
            return ctx.json({ id: created.id }, 201);
        } catch (err) {
            const code = (err as { code?: string }).code;
            if (code === '23505') return ctx.json({ error: 'slug already exists for this user' }, 409);
            throw err;
        }
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /:id                              — project detail
    // ────────────────────────────────────────────────────────────────────
    router.get('/:id', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);
        const detail = await withUser(pool, uid, async (db) => getProjectDetail(db, id));
        if (!detail) return ctx.json({ error: 'Not found' }, 404);
        return ctx.json(detail);
    });

    // ────────────────────────────────────────────────────────────────────
    // PATCH /:id                            — update fields
    // ────────────────────────────────────────────────────────────────────
    router.patch('/:id', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;

        if (input.type           !== undefined && !isValidOption(VALID_TYPES, input.type))              return ctx.json({ error: 'invalid type' }, 400);
        if (input.status         !== undefined && !isValidOption(VALID_STATUSES, input.status))         return ctx.json({ error: 'invalid status' }, 400);
        if (input.visibility     !== undefined && !isValidOption(VALID_VISIBILITIES, input.visibility)) return ctx.json({ error: 'invalid visibility' }, 400);
        if (input.role_exhibited !== undefined && !isValidOption(VALID_ROLES, input.role_exhibited))    return ctx.json({ error: 'invalid role_exhibited' }, 400);
        if (input.user_overrides !== undefined && !isPlainObject(input.user_overrides))                   return ctx.json({ error: 'user_overrides must be an object' }, 400);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            patchProject(db, id, {
                name:           typeof input.name           === 'string' ? input.name           : undefined,
                tagline:        nullableString(input.tagline),
                pitch:          nullableString(input.pitch),
                type:           typeof input.type           === 'string' ? input.type           : undefined,
                status:         typeof input.status         === 'string' ? input.status         : undefined,
                role_exhibited: typeof input.role_exhibited === 'string' ? input.role_exhibited : undefined,
                visibility:     typeof input.visibility     === 'string' ? input.visibility     : undefined,
                user_overrides: isPlainObject(input.user_overrides) ? input.user_overrides : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
        // fire-and-forget — Redis latency/faults must never pad or fail the write
        void invalidateProject(id);
        return ctx.json({ updated: result.updated });
    });

    // ────────────────────────────────────────────────────────────────────
    // DELETE /:id                           — soft delete
    // ────────────────────────────────────────────────────────────────────
    router.delete('/:id', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) => archiveProject(db, id));
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
        void invalidateProject(id);
        return ctx.json({ archived: true });
    });

    // ────────────────────────────────────────────────────────────────────
    // POST /:id/confirm                     — confirm AI proposal +
    //                                          dispatch case-study Job
    //
    // Phase 4 — onboarding insertion. Confirmation is the user-driven
    // pivot point: clicking Confirm flips `is_user_confirmed=true`,
    // resets `case_study_status='pending'`, and (best-effort) dispatches
    // the case-study K8s Job so the recruiter-facing surface fills in
    // without a second click.
    //
    // Confirmation always succeeds independent of dispatch outcome —
    // missing GitHub credentials or transient K8s errors set
    // `dispatched: false` + a `reason`, and the frontend can re-trigger
    // via /:id/regenerate. The hard failure path is reserved for
    // pipeline_runs INSERT errors (data integrity).
    // ────────────────────────────────────────────────────────────────────
    router.post('/:id/confirm', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);

        const guarded = await withUser(pool, uid, async (db) => {
            const r = await db.query<{ status: string }>(
                `SELECT status FROM projects WHERE id = $1`,
                [id],
            );
            if (r.rows.length === 0) return { ok: false, code: 404 as const, msg: 'Not found' };
            const row = r.rows[0]!;
            if (row.status === 'archived') {
                return { ok: false, code: 409 as const, msg: 'Cannot confirm an archived project' };
            }
            await db.query(
                `UPDATE projects
                    SET is_user_confirmed = TRUE,
                        case_study_status = 'pending',
                        updated_at = NOW()
                  WHERE id = $1`,
                [id],
            );
            const archivedDefaults = await archiveSupersededDefaults(db, uid, id);
            return { ok: true as const, archivedDefaults };
        });
        if (!guarded.ok) return ctx.json({ error: guarded.msg }, guarded.code);
        void invalidateProject(id);

        const dispatch = await dispatchCaseStudyJob(pool, config, uid, id, 'confirm');
        if (dispatch.ok) {
            return ctx.json({
                confirmed:        true,
                dispatched:       true,
                pipelineRunId:    dispatch.pipelineRunId,
                jobName:          dispatch.jobName,
                projectId:        id,
                archivedDefaults: guarded.archivedDefaults,
            }, 202);
        }
        if (dispatch.fatal) return ctx.json({ error: dispatch.reason }, 500);
        return ctx.json({
            confirmed:        true,
            dispatched:       false,
            reason:           dispatch.reason,
            projectId:        id,
            archivedDefaults: guarded.archivedDefaults,
        });
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /:id/decisions                    — list
    // ────────────────────────────────────────────────────────────────────
    router.get('/:id/decisions', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);
        const detail = await withUser(pool, uid, async (db) => getProjectDetail(db, id));
        if (!detail) return ctx.json({ error: 'Not found' }, 404);
        return ctx.json({ items: detail.decisions });
    });

    // ────────────────────────────────────────────────────────────────────
    // PATCH /:id/decisions/:did             — edit / confirm
    // ────────────────────────────────────────────────────────────────────
    router.patch('/:id/decisions/:did', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id  = ctx.req.param('id');
        const did = ctx.req.param('did');
        if (!isUuid(id))  return ctx.json({ error: 'invalid project id' }, 400);
        if (!isUuid(did)) return ctx.json({ error: 'invalid decision id' }, 400);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;
        if (input.confidence !== undefined && !isValidOption(VALID_CONFIDENCE, input.confidence)) {
            return ctx.json({ error: 'invalid confidence' }, 400);
        }

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            patchDecision(db, id, did, {
                title:             typeof input.title             === 'string'  ? input.title             : undefined,
                context:           nullableString(input.context),
                decision:          nullableString(input.decision),
                consequences:      nullableString(input.consequences),
                confidence:        typeof input.confidence        === 'string'  ? input.confidence        : undefined,
                is_user_confirmed: typeof input.is_user_confirmed === 'boolean' ? input.is_user_confirmed : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
        void invalidateProject(id);
        return ctx.json({ updated: result.updated });
    });

    // ────────────────────────────────────────────────────────────────────
    // DELETE /:id/decisions/:did            — remove
    // ────────────────────────────────────────────────────────────────────
    router.delete('/:id/decisions/:did', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id  = ctx.req.param('id');
        const did = ctx.req.param('did');
        if (!isUuid(id))  return ctx.json({ error: 'invalid project id' }, 400);
        if (!isUuid(did)) return ctx.json({ error: 'invalid decision id' }, 400);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) => deleteDecision(db, id, did));
        if (result.deleted === 0) return ctx.json({ error: 'Not found' }, 404);
        void invalidateProject(id);
        return ctx.json({ deleted: result.deleted });
    });

    // ────────────────────────────────────────────────────────────────────
    // GET /:id/architecture                 — Mermaid source
    // ────────────────────────────────────────────────────────────────────
    router.get('/:id/architecture', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);
        const detail = await withUser(pool, uid, async (db) => getProjectDetail(db, id));
        if (!detail) return ctx.json({ error: 'Not found' }, 404);
        if (!detail.architecture) return ctx.json({ error: 'No architecture diagram yet' }, 404);
        return ctx.json(detail.architecture);
    });

    // ────────────────────────────────────────────────────────────────────
    // PATCH /:id/architecture               — user edits (sticky)
    // ────────────────────────────────────────────────────────────────────
    router.patch('/:id/architecture', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;
        const format = input.diagram_format;
        if (format !== undefined && format !== 'mermaid' && format !== 'svg') {
            return ctx.json({ error: 'diagram_format must be mermaid or svg' }, 400);
        }
        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            patchArchitecture(db, id, {
                diagram_format: format,
                diagram_source: typeof input.diagram_source === 'string' ? input.diagram_source : undefined,
                nodes:          Array.isArray(input.nodes) ? input.nodes : undefined,
                edges:          Array.isArray(input.edges) ? input.edges : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
        void invalidateProject(id);
        return ctx.json({ updated: result.updated });
    });

    // ────────────────────────────────────────────────────────────────────
    // POST /merge                           — merge two or more projects
    // ────────────────────────────────────────────────────────────────────
    router.post('/merge', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;
        const targetId  = input.target_id;
        const sourceIds = input.source_ids;
        if (!isUuid(targetId)) return ctx.json({ error: 'target_id must be a uuid' }, 400);
        if (!Array.isArray(sourceIds) || sourceIds.length === 0 || !sourceIds.every(isUuid)) {
            return ctx.json({ error: 'source_ids must be a non-empty array of uuids' }, 400);
        }
        if (sourceIds.includes(targetId)) {
            return ctx.json({ error: 'target_id must not appear in source_ids' }, 400);
        }

        const pool = getPool(config);
        const summary = await withUser(pool, uid, async (db) =>
            mergeProjects(db, targetId, sourceIds),
        );
        void Promise.all([targetId, ...sourceIds].map(invalidateProject));
        return ctx.json(summary);
    });

    // ────────────────────────────────────────────────────────────────────
    // POST /:id/split                       — carve components into a new project
    // ────────────────────────────────────────────────────────────────────
    router.post('/:id/split', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const body = await ctx.req.json().catch(() => null);
        if (!body || typeof body !== 'object') return ctx.json({ error: 'Invalid JSON' }, 400);
        const input = body as Record<string, unknown>;
        const componentIds = input.component_ids;
        const name         = input.name;
        const slug         = input.slug;
        if (!Array.isArray(componentIds) || componentIds.length === 0 || !componentIds.every(isUuid)) {
            return ctx.json({ error: 'component_ids must be a non-empty array of uuids' }, 400);
        }
        if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
            return ctx.json({ error: 'name must be 1-200 chars' }, 400);
        }
        if (typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
            return ctx.json({ error: 'slug must match ^[a-z0-9-]+$ (1-80 chars)' }, 400);
        }
        const pool = getPool(config);
        try {
            const result = await withUser(pool, uid, async (db) =>
                splitProject(db, uid, id, {
                    componentIds,
                    name, slug,
                }),
            );
            void Promise.all([id, result.newProjectId].map(invalidateProject));
            return ctx.json(result, 201);
        } catch (err) {
            const code = (err as { code?: string }).code;
            if (code === '23505') return ctx.json({ error: 'slug already exists for this user' }, 409);
            throw err;
        }
    });

    // ────────────────────────────────────────────────────────────────────
    // POST /clustering/run               — fire-and-forget clustering Job
    // ────────────────────────────────────────────────────────────────────
    router.post('/clustering/run', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);

        const pool = getPool(config);

        // Pro-only: multi_repo clustering is a paid feature. Hard server guard
        // (the UI also hides the trigger for non-pro, but never trust the client).
        const planRes = await pool.query<{ plan: string }>(
            `SELECT plan FROM users WHERE id = $1::uuid`,
            [uid],
        );
        if ((planRes.rows[0]?.plan ?? 'free') !== 'pro') {
            return ctx.json({ error: 'Multi-repo projects require Pro' }, 403);
        }

        const image = getJobImage('job-strategist');
        if (!isImageConfigured(image)) {
            console.error('[projects/clustering] image URI unresolved');
            return ctx.json({ error: 'Strategist pipeline image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
        }

        const pipelineRunId = randomUUID();

        try {
            await withUser(pool, uid, async (db) => {
                await insertPipelineRun(db, {
                    id:           pipelineRunId,
                    userId:       uid,
                    pipelineType: 'clustering',
                    referenceId:  null,
                    metadata:     { triggeredBy: 'manual' },
                });
            });
        } catch (err) {
            console.error('[projects/clustering] failed to insert pipeline_run', err);
            return ctx.json({ error: 'Failed to record pipeline run' }, 500);
        }

        const job = buildPipelineJob({
            namespace:          config.strategistPipelineNamespace,
            image,
            serviceAccountName: config.strategistPipelineServiceAccount,
            nameStem:           `proj-cluster-${sanitizeLabel(uid).slice(0, 16)}`,
            suffixInput:        `${pipelineRunId}:${Date.now()}`,
            labels: {
                app:    'project-clustering',
                userId: sanitizeLabel(uid),
            },
            command: ['node', 'dist/run-clustering.js'],
            env: [
                { name: 'CLUSTERING_PIPELINE_RUN_ID', value: pipelineRunId },
                { name: 'USER_ID',                    value: uid },
            ],
            envFromSecretRefs: ['platform-rds-credentials'],
        });

        try {
            await getBatchApi().createNamespacedJob({
                namespace: config.strategistPipelineNamespace,
                body:      job,
            });
        } catch (err) {
            console.error('[projects/clustering] failed to create K8s Job', err);
            return ctx.json({ error: 'Failed to schedule clustering Job' }, 502);
        }

        return ctx.json({
            status:        'queued',
            pipelineRunId,
            jobName:       job.metadata!.name!,
        }, 202);
    });

    // ────────────────────────────────────────────────────────────────────
    // POST /:id/regenerate               — case-study Job for one project
    // ────────────────────────────────────────────────────────────────────
    router.post('/:id/regenerate', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);

        // Guard: project must exist, be confirmed, and not archived.
        const guarded = await withUser(pool, uid, async (db) => {
            const r = await db.query<{ is_user_confirmed: boolean; status: string }>(
                `SELECT is_user_confirmed, status FROM projects WHERE id = $1`,
                [id],
            );
            if (r.rows.length === 0) return { ok: false, code: 404 as const, msg: 'Not found' };
            const row = r.rows[0]!;
            if (!row.is_user_confirmed) return { ok: false, code: 409 as const, msg: 'Project must be confirmed before regeneration' };
            if (row.status === 'archived') return { ok: false, code: 409 as const, msg: 'Cannot regenerate an archived project' };
            await db.query(
                `UPDATE projects
                    SET case_study_status = 'pending', updated_at = NOW()
                  WHERE id = $1`,
                [id],
            );
            return { ok: true as const };
        });
        if (!guarded.ok) return ctx.json({ error: guarded.msg }, guarded.code);
        void invalidateProject(id);

        const dispatch = await dispatchCaseStudyJob(pool, config, uid, id, 'manual');
        if (dispatch.ok) {
            return ctx.json({
                status:        'queued',
                pipelineRunId: dispatch.pipelineRunId,
                jobName:       dispatch.jobName,
                projectId:     id,
            }, 202);
        }
        if (dispatch.fatal) return ctx.json({ error: dispatch.reason }, 500);
        // Caller explicitly asked for dispatch — surface non-fatal failures
        // as 502/412/503 so they can react. confirm tolerates the same
        // reasons silently.
        if (dispatch.reason === 'github_not_connected') return ctx.json({ error: dispatch.reason }, 412);
        if (dispatch.reason === 'github_app_not_configured') return ctx.json({ error: dispatch.reason }, 503);
        return ctx.json({ error: dispatch.reason }, 502);
    });

    return router;
}

// ───────────────────────────────────────────────────────────────────────────
// GitHub installation lookup (mirror of github.ts helper).
// Connection rows live outside RLS-scoped tables; the helper queries the
// pool directly using the superuser connection.
// ───────────────────────────────────────────────────────────────────────────
async function getGitHubInstallation(
    pool: Pool,
    userId: string,
): Promise<{ installation_id: string } | null> {
    const r = await pool.query<{ installation_id: string | null }>(
        `SELECT installation_id FROM oauth_connections
          WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
    );
    const row = r.rows[0];
    if (!row?.installation_id) return null;
    return { installation_id: row.installation_id };
}

// ───────────────────────────────────────────────────────────────────────────
// Case-study Job dispatch helper.
//
// Used by both /:id/confirm (best-effort) and /:id/regenerate (strict —
// the caller propagates the failure). Returns a discriminated union so
// callers can distinguish "user can retry later" failures (no GitHub
// connection, image not yet configured, K8s rejection) from "data
// integrity broken" failures (pipeline_runs INSERT failed).
//
// `triggeredBy` lands on pipeline_runs.metadata so analytics can split
// confirm-driven from manual regenerations.
// ───────────────────────────────────────────────────────────────────────────
type DispatchResult =
    | { ok: true; pipelineRunId: string; jobName: string }
    | { ok: false; fatal: boolean; reason: string };

async function dispatchCaseStudyJob(
    pool: Pool,
    config: AdminApiConfig,
    userId: string,
    projectId: string,
    triggeredBy: 'confirm' | 'manual',
): Promise<DispatchResult> {
    const { githubAppId, githubPrivateKey } = config;
    if (!githubAppId || !githubPrivateKey) {
        return { ok: false, fatal: false, reason: 'github_app_not_configured' };
    }

    const image = getJobImage('job-strategist');
    if (!isImageConfigured(image)) {
        return { ok: false, fatal: false, reason: 'image_not_configured' };
    }

    const installation = await getGitHubInstallation(pool, userId);
    if (!installation) return { ok: false, fatal: false, reason: 'github_not_connected' };

    let githubToken: string;
    try {
        githubToken = await generateInstallationToken(
            githubAppId, githubPrivateKey, installation.installation_id,
        );
    } catch (err) {
        console.error('[projects/dispatch] installation token failed', err);
        return { ok: false, fatal: false, reason: 'installation_token_failed' };
    }

    const pipelineRunId = randomUUID();
    try {
        await withUser(pool, userId, async (db) => {
            await insertPipelineRun(db, {
                id:           pipelineRunId,
                userId,
                pipelineType: 'case_study',
                referenceId:  projectId,
                metadata:     { projectId, triggeredBy },
            });
        });
    } catch (err) {
        console.error('[projects/dispatch] failed to insert pipeline_run', err);
        return { ok: false, fatal: true, reason: 'pipeline_run_insert_failed' };
    }

    const job = buildPipelineJob({
        namespace:          config.strategistPipelineNamespace,
        image,
        serviceAccountName: config.strategistPipelineServiceAccount,
        nameStem:           `proj-cs-${sanitizeLabel(projectId).slice(0, 16)}`,
        suffixInput:        `${pipelineRunId}:${projectId}:${Date.now()}`,
        labels: {
            app:        'project-case-study',
            userId:     sanitizeLabel(userId),
            projectId:  sanitizeLabel(projectId),
            trigger:    triggeredBy,
        },
        command: ['node', 'dist/run-case-study.js'],
        env: [
            { name: 'CASE_STUDY_PIPELINE_RUN_ID', value: pipelineRunId },
            { name: 'PROJECT_ID',                 value: projectId },
            { name: 'USER_ID',                    value: userId },
            { name: 'GITHUB_TOKEN',               value: githubToken },
        ],
        envFromSecretRefs: ['platform-rds-credentials'],
    });

    try {
        await getBatchApi().createNamespacedJob({
            namespace: config.strategistPipelineNamespace,
            body:      job,
        });
    } catch (err) {
        console.error('[projects/dispatch] failed to create K8s Job', err);
        return { ok: false, fatal: false, reason: 'k8s_create_failed' };
    }

    return { ok: true, pipelineRunId, jobName: job.metadata!.name! };
}
