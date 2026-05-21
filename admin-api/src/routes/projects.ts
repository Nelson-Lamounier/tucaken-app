/**
 * @format
 * admin-api — Projects domain routes (Phase 3a).
 *
 * User-scoped reads + user-edit writes. K8s Job dispatch routes
 * (clustering/run, :id/regenerate) land in a follow-on PR alongside the
 * onboarding orchestrator (Phase 4) so the dispatch contract is decided
 * once.
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

import type { AdminApiConfig } from '../lib/config.js';
import { getPool, withUser } from '../lib/pg.js';
import {
    archiveProject,
    confirmProject,
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

const VALID_TYPES        = ['side_project', 'open_source', 'production_saas', 'client_work', 'internal_tool', 'learning_project'];
const VALID_STATUSES     = ['active', 'stable', 'dormant', 'archived'];
const VALID_VISIBILITIES = ['private', 'unlisted', 'public'];
const VALID_ROLES        = ['sole_builder', 'lead', 'contributor', 'maintainer'];
const VALID_CONFIDENCE   = ['high', 'medium', 'low'];

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

function isUuid(value: unknown): value is string {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parsePositiveInt(input: string | undefined, fallback: number, max: number): number {
    if (!input) return fallback;
    const n = parseInt(input, 10);
    if (Number.isNaN(n) || n < 0) return fallback;
    return Math.min(n, max);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
        if (input.type           !== undefined && !VALID_TYPES.includes(String(input.type)))                return ctx.json({ error: 'invalid type' }, 400);
        if (input.status         !== undefined && !VALID_STATUSES.includes(String(input.status)))           return ctx.json({ error: 'invalid status' }, 400);
        if (input.visibility     !== undefined && !VALID_VISIBILITIES.includes(String(input.visibility)))   return ctx.json({ error: 'invalid visibility' }, 400);
        if (input.role_exhibited !== undefined && !VALID_ROLES.includes(String(input.role_exhibited)))      return ctx.json({ error: 'invalid role_exhibited' }, 400);

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

        if (input.type           !== undefined && !VALID_TYPES.includes(String(input.type)))              return ctx.json({ error: 'invalid type' }, 400);
        if (input.status         !== undefined && !VALID_STATUSES.includes(String(input.status)))         return ctx.json({ error: 'invalid status' }, 400);
        if (input.visibility     !== undefined && !VALID_VISIBILITIES.includes(String(input.visibility))) return ctx.json({ error: 'invalid visibility' }, 400);
        if (input.role_exhibited !== undefined && !VALID_ROLES.includes(String(input.role_exhibited)))    return ctx.json({ error: 'invalid role_exhibited' }, 400);
        if (input.user_overrides !== undefined && !isPlainObject(input.user_overrides))                   return ctx.json({ error: 'user_overrides must be an object' }, 400);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            patchProject(db, id, {
                name:           typeof input.name           === 'string' ? input.name           : undefined,
                tagline:        input.tagline === null ? null : (typeof input.tagline === 'string' ? input.tagline : undefined),
                pitch:          input.pitch   === null ? null : (typeof input.pitch   === 'string' ? input.pitch   : undefined),
                type:           typeof input.type           === 'string' ? input.type           : undefined,
                status:         typeof input.status         === 'string' ? input.status         : undefined,
                role_exhibited: typeof input.role_exhibited === 'string' ? input.role_exhibited : undefined,
                visibility:     typeof input.visibility     === 'string' ? input.visibility     : undefined,
                user_overrides: isPlainObject(input.user_overrides) ? input.user_overrides : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
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
        return ctx.json({ archived: true });
    });

    // ────────────────────────────────────────────────────────────────────
    // POST /:id/confirm                     — confirm AI proposal
    // ────────────────────────────────────────────────────────────────────
    router.post('/:id/confirm', async (ctx) => {
        const uid = requireUserId(ctx);
        if (!uid) return ctx.json({ error: 'Authenticated subject missing' }, 401);
        const id = ctx.req.param('id');
        if (!isUuid(id)) return ctx.json({ error: 'invalid id' }, 400);

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) => confirmProject(db, id));
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
        // Case-study Job dispatch lands in PR-3b; for now the response is
        // intentionally narrow so callers don't depend on a job_id.
        return ctx.json({ confirmed: true });
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
        if (input.confidence !== undefined && !VALID_CONFIDENCE.includes(String(input.confidence))) {
            return ctx.json({ error: 'invalid confidence' }, 400);
        }

        const pool = getPool(config);
        const result = await withUser(pool, uid, async (db) =>
            patchDecision(db, id, did, {
                title:             typeof input.title             === 'string'  ? input.title             : undefined,
                context:           input.context === null ? null : (typeof input.context === 'string' ? input.context : undefined),
                decision:          input.decision === null ? null : (typeof input.decision === 'string' ? input.decision : undefined),
                consequences:      input.consequences === null ? null : (typeof input.consequences === 'string' ? input.consequences : undefined),
                confidence:        typeof input.confidence        === 'string'  ? input.confidence        : undefined,
                is_user_confirmed: typeof input.is_user_confirmed === 'boolean' ? input.is_user_confirmed : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
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
                diagram_format: format as ('mermaid' | 'svg' | undefined),
                diagram_source: typeof input.diagram_source === 'string' ? input.diagram_source : undefined,
                nodes:          Array.isArray(input.nodes) ? input.nodes : undefined,
                edges:          Array.isArray(input.edges) ? input.edges : undefined,
            }),
        );
        if (result.updated === 0) return ctx.json({ error: 'Not found' }, 404);
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
            mergeProjects(db, targetId as string, sourceIds as string[]),
        );
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
                    componentIds: componentIds as string[],
                    name, slug,
                }),
            );
            return ctx.json(result, 201);
        } catch (err) {
            const code = (err as { code?: string }).code;
            if (code === '23505') return ctx.json({ error: 'slug already exists for this user' }, 409);
            throw err;
        }
    });

    // Defensive: keep the randomUUID import live in case future routes need
    // it locally (split uses randomUUID inside the repository).
    void randomUUID;

    return router;
}
