/**
 * @format
 * admin-api — Project core routes (list, create, detail, mutate, lifecycle).
 *
 * Routes (mounted under /api/admin/projects by the projects.ts facade):
 *   GET    /                — list user's projects (paginated)
 *   POST   /                — create a project manually
 *   GET    /:id             — full project detail with case study
 *   PATCH  /:id             — update name / pitch / status / visibility
 *   DELETE /:id             — soft delete (status='archived')
 *   POST   /:id/confirm     — confirm an AI-suggested grouping (+ case-study Job)
 *   POST   /merge           — merge sources into a target
 *   POST   /:id/split       — split components into a new project
 *   POST   /:id/regenerate  — strict case-study Job re-dispatch
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { entitlementsFromConfig } from '../../lib/billing/entitlements.js';
import { getCachedTierConfig } from '../../lib/billing/tier-config-cache.js';
import { dispatchCaseStudyJob } from '../../lib/jobs/case-study-dispatch.js';
import { getPool, withUser } from '../../lib/pg.js';
import { invalidateProject } from '../../lib/redis-cache.js';
import {
    archiveProject,
    archiveSupersededDefaults,
    countUserProjects,
    createProject,
    getProjectDetail,
    listProjects,
    mergeProjects,
    patchProject,
    splitProject,
} from '../../lib/repositories/projects.js';
import { getUserPlanStatus } from '../../lib/repositories/users.js';
import { AdminApiBindings, requireUserId } from '../../lib/types.js';
import {
    SLUG_REGEX,
    VALID_ROLES,
    VALID_STATUSES,
    VALID_TYPES,
    VALID_VISIBILITIES,
    isPlainObject,
    isUuid,
    isValidOption,
    nullableString,
    parsePositiveInt,
} from './projects-shared.js';

export function createProjectsCoreRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
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
        const planStatus = await getUserPlanStatus(pool, uid);
        const role = planStatus?.role ?? null;
        const tierConfig = await getCachedTierConfig(pool);
        const projectCap = entitlementsFromConfig(tierConfig, planStatus?.effectivePlan ?? 'free', role).projects;
        if (Number.isFinite(projectCap)) {
            const existing = await withUser(pool, uid, (db) => countUserProjects(db, uid));
            if (existing >= projectCap) {
                return ctx.json({
                    error: `Your plan allows ${projectCap} project${projectCap === 1 ? '' : 's'}. Upgrade for more.`,
                    upgradeUrl: '/pricing',
                }, 403);
            }
        }
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
