/**
 * @format
 * admin-api — Projects domain queries.
 *
 * Every function runs against a `Queryable` (Pool or PoolClient) so the
 * route layer can wrap calls inside `withUser(pool, userId, fn)` to
 * enforce RLS at the database tier. Repositories never resolve the
 * user_id themselves — RLS does.
 *
 * Two responsibilities here:
 *   - read projection helpers used by the list / detail endpoints
 *   - small writers for the user-edit flows (confirm, patch, soft-delete,
 *     decisions, architecture, merge, split). No Bedrock / K8s work.
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '../pg.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ProjectSummary {
    id:                       string;
    slug:                     string;
    name:                     string;
    tagline:                  string | null;
    type:                     string;
    shape:                    string;
    status:                   string;
    role_exhibited:           string;
    visibility:               string;
    is_ai_suggested:          boolean;
    is_user_confirmed:        boolean;
    case_study_status:        string | null;
    case_study_generated_at:  string | null;
    last_activity_at:         string | null;
    started_at:               string | null;
    ended_at:                 string | null;
    created_at:               string;
    updated_at:               string;
    repository_count:         number;
}

export interface ProjectDetail extends ProjectSummary {
    pitch:                    string | null;
    proposal_reasoning:       string | null;
    proposal_confidence:      string | null;
    proposal_pipeline_run_id: string | null;
    user_overrides:           Record<string, unknown>;
    components:               ComponentRow[];
    repositories:             RepositoryLinkRow[];
    decisions:                DecisionRow[];
    highlights:               HighlightRow[];
    challenges:               ChallengeRow[];
    stack_items:              StackItemRow[];
    depth_markers:            DepthMarkersRow | null;
    architecture:             ArchitectureRow | null;
    resume_bullets:           ResumeBulletRow[];
    tags:                     string[];
}

export interface ComponentRow {
    id:          string;
    name:        string;
    kind:        string;
    order_index: number;
}

export interface RepositoryLinkRow {
    component_id:    string;
    repository_id:   string;
    repository_name: string;
    subpath:         string;
}

export interface DecisionRow {
    id:                 string;
    title:              string;
    context:            string | null;
    decision:           string | null;
    consequences:       string | null;
    confidence:         string;
    is_user_confirmed:  boolean;
    source_signals:     unknown;
    order_index:        number;
}

export interface HighlightRow {
    id:             string;
    title:          string;
    description:    string | null;
    source_signals: unknown;
    order_index:    number;
}

export interface ChallengeRow {
    id:             string;
    problem:        string;
    solution:       string | null;
    source_signals: unknown;
    order_index:    number;
}

export interface StackItemRow {
    id:                   string;
    category:             string;
    name:                 string;
    justification:        string | null;
    used_in_component_id: string | null;
    source_signals:       unknown;
    order_index:          number;
}

export interface DepthMarkersRow {
    has_tests:               boolean;
    test_coverage_signal:    string;
    has_ci:                  boolean;
    ci_maturity:             string;
    documentation_density:   string;
    has_deployment_evidence: boolean;
    deployment_url:          string | null;
    refactor_count:          number;
    computed_at:             string;
}

export interface ArchitectureRow {
    diagram_format: string;
    diagram_source: string;
    nodes:          unknown;
    edges:          unknown;
    is_user_edited: boolean;
    generated_at:   string;
}

export interface ResumeBulletRow {
    angle:        string;
    bullets:      string[];
    generated_at: string;
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * Status values surfaced to the user as "live" — non-archived. Archived
 * projects are the soft-delete bucket; they remain readable via an
 * explicit `?includeArchived=true` query param on the list route.
 */
const VISIBLE_STATUSES = `('active','stable','dormant')`;

export interface ListProjectsOptions {
    limit:           number;
    offset:          number;
    includeArchived: boolean;
    proposalsOnly:   boolean;
}

export async function listProjects(db: Queryable, options: ListProjectsOptions): Promise<{
    total: number;
    rows:  ProjectSummary[];
}> {
    const filters: string[] = [];
    if (!options.includeArchived) filters.push(`status IN ${VISIBLE_STATUSES}`);
    if (options.proposalsOnly)    filters.push(`is_ai_suggested = TRUE AND is_user_confirmed = FALSE`);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const totalResult = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM projects ${where}`,
    );
    const total = parseInt(totalResult.rows[0]?.count ?? '0', 10);

    const result = await db.query<ProjectSummary>(
        `SELECT
            p.id, p.slug, p.name, p.tagline, p.type, p.shape, p.status,
            p.role_exhibited, p.visibility,
            p.is_ai_suggested, p.is_user_confirmed,
            p.case_study_status,
            p.case_study_generated_at,
            p.last_activity_at,
            p.started_at,
            p.ended_at,
            p.created_at,
            p.updated_at,
            (SELECT COUNT(*)::int FROM project_repositories pr
              JOIN project_components pc ON pc.id = pr.project_component_id
              WHERE pc.project_id = p.id) AS repository_count
           FROM projects p
           ${where}
           ORDER BY COALESCE(p.last_activity_at, p.created_at) DESC
           LIMIT $1 OFFSET $2`,
        [options.limit, options.offset],
    );
    return { total, rows: result.rows };
}

export async function getProjectDetail(db: Queryable, id: string): Promise<ProjectDetail | null> {
    const project = await db.query<ProjectSummary & {
        pitch:                    string | null;
        proposal_reasoning:       string | null;
        proposal_confidence:      string | null;
        proposal_pipeline_run_id: string | null;
        user_overrides:           Record<string, unknown> | null;
    }>(
        `SELECT
            p.id, p.slug, p.name, p.tagline, p.pitch, p.type, p.shape, p.status,
            p.role_exhibited, p.visibility,
            p.is_ai_suggested, p.is_user_confirmed,
            p.case_study_status, p.case_study_generated_at,
            p.last_activity_at, p.started_at, p.ended_at,
            p.created_at, p.updated_at,
            p.proposal_reasoning, p.proposal_confidence, p.proposal_pipeline_run_id,
            p.user_overrides,
            (SELECT COUNT(*)::int FROM project_repositories pr
              JOIN project_components pc ON pc.id = pr.project_component_id
              WHERE pc.project_id = p.id) AS repository_count
           FROM projects p
           WHERE p.id = $1`,
        [id],
    );
    const p = project.rows[0];
    if (!p) return null;

    const [components, repositories, decisions, highlights, challenges, stack, depth, architecture, resumeBullets, tags] =
        await Promise.all([
            db.query<ComponentRow>(
                `SELECT id, name, kind, order_index
                 FROM project_components WHERE project_id = $1 ORDER BY order_index`,
                [id],
            ),
            db.query<RepositoryLinkRow>(
                `SELECT pr.project_component_id AS component_id, pr.repository_id, r.full_name AS repository_name, pr.subpath
                 FROM project_repositories pr
                 JOIN project_components pc ON pc.id = pr.project_component_id
                 JOIN repositories r ON r.id = pr.repository_id
                 WHERE pc.project_id = $1
                 ORDER BY pc.order_index, r.full_name`,
                [id],
            ),
            db.query<DecisionRow>(
                `SELECT id, title, context, decision, consequences, confidence,
                        is_user_confirmed, source_signals, order_index
                 FROM project_decisions WHERE project_id = $1 ORDER BY order_index`,
                [id],
            ),
            db.query<HighlightRow>(
                `SELECT id, title, description, source_signals, order_index
                 FROM project_highlights WHERE project_id = $1 ORDER BY order_index`,
                [id],
            ),
            db.query<ChallengeRow>(
                `SELECT id, problem, solution, source_signals, order_index
                 FROM project_challenges WHERE project_id = $1 ORDER BY order_index`,
                [id],
            ),
            db.query<StackItemRow>(
                `SELECT id, category, name, justification, used_in_component_id, source_signals, order_index
                 FROM project_stack_items WHERE project_id = $1 ORDER BY order_index`,
                [id],
            ),
            db.query<DepthMarkersRow>(
                `SELECT has_tests, test_coverage_signal, has_ci, ci_maturity,
                        documentation_density, has_deployment_evidence, deployment_url,
                        refactor_count, computed_at
                 FROM project_depth_markers WHERE project_id = $1`,
                [id],
            ),
            db.query<ArchitectureRow>(
                `SELECT diagram_format, diagram_source, nodes, edges, is_user_edited, generated_at
                 FROM project_architecture WHERE project_id = $1`,
                [id],
            ),
            db.query<ResumeBulletRow>(
                `SELECT angle, bullets, generated_at
                 FROM project_resume_bullets WHERE project_id = $1`,
                [id],
            ),
            db.query<{ tag: string }>(
                `SELECT tag FROM project_tags WHERE project_id = $1 ORDER BY tag`,
                [id],
            ),
        ]);

    return {
        ...p,
        user_overrides: p.user_overrides ?? {},
        components:    components.rows,
        repositories:  repositories.rows,
        decisions:     decisions.rows,
        highlights:    highlights.rows,
        challenges:    challenges.rows,
        stack_items:   stack.rows,
        depth_markers: depth.rows[0] ?? null,
        architecture:  architecture.rows[0] ?? null,
        resume_bullets: resumeBullets.rows,
        tags:          tags.rows.map((r) => r.tag),
    };
}

// ─── Writes ────────────────────────────────────────────────────────────────

export interface CreateProjectInput {
    slug:             string;
    name:             string;
    tagline?:         string | undefined;
    pitch?:           string | undefined;
    type?:            string | undefined;
    shape?:           string | undefined;
    status?:          string | undefined;
    role_exhibited?:  string | undefined;
    visibility?:      string | undefined;
}

export async function createProject(
    db: Queryable,
    userId: string,
    input: CreateProjectInput,
): Promise<{ id: string }> {
    const r = await db.query<{ id: string }>(
        `INSERT INTO projects (
            user_id, slug, name, tagline, pitch, type, shape, status,
            role_exhibited, visibility,
            is_ai_suggested, is_user_confirmed
         ) VALUES (
            $1::uuid, $2, $3, $4, $5,
            COALESCE($6, 'side_project'),
            COALESCE($7, 'single_repo'),
            COALESCE($8, 'active'),
            COALESCE($9, 'sole_builder'),
            COALESCE($10, 'private'),
            FALSE, TRUE
         ) RETURNING id`,
        [
            userId, input.slug, input.name,
            input.tagline ?? null,
            input.pitch ?? null,
            input.type ?? null,
            input.shape ?? null,
            input.status ?? null,
            input.role_exhibited ?? null,
            input.visibility ?? null,
        ],
    );
    const created = r.rows[0];
    if (!created) throw new Error('createProject: INSERT … RETURNING returned no row');
    return { id: created.id };
}

export interface PatchProjectInput {
    name?:             string | undefined;
    tagline?:          string | null | undefined;
    pitch?:            string | null | undefined;
    type?:             string | undefined;
    status?:           string | undefined;
    role_exhibited?:   string | undefined;
    visibility?:       string | undefined;
    user_overrides?:   Record<string, unknown> | undefined;
}

export async function patchProject(
    db: Queryable,
    id: string,
    input: PatchProjectInput,
): Promise<{ updated: number }> {
    const sets: string[]   = [];
    const params: unknown[] = [];
    let idx = 1;
    const add = (col: string, value: unknown) => {
        sets.push(`${col} = $${idx++}`);
        params.push(value);
    };

    if (input.name           !== undefined) add('name',           input.name);
    if (input.tagline        !== undefined) add('tagline',        input.tagline);
    if (input.pitch          !== undefined) add('pitch',          input.pitch);
    if (input.type           !== undefined) add('type',           input.type);
    if (input.status         !== undefined) add('status',         input.status);
    if (input.role_exhibited !== undefined) add('role_exhibited', input.role_exhibited);
    if (input.visibility     !== undefined) add('visibility',     input.visibility);
    if (input.user_overrides !== undefined) {
        sets.push(`user_overrides = $${idx++}::jsonb`);
        params.push(JSON.stringify(input.user_overrides));
    }
    if (sets.length === 0) return { updated: 0 };

    sets.push('updated_at = NOW()');
    params.push(id);
    const r = await db.query(
        `UPDATE projects SET ${sets.join(', ')} WHERE id = $${idx}`,
        params,
    );
    return { updated: r.rowCount ?? 0 };
}

/**
 * Soft-delete via `status = 'archived'`. We keep the row + all its
 * children to preserve evidence; a future hard-delete migration can
 * reclaim space.
 */
export async function archiveProject(db: Queryable, id: string): Promise<{ updated: number }> {
    const r = await db.query(
        `UPDATE projects SET status = 'archived', updated_at = NOW() WHERE id = $1`,
        [id],
    );
    return { updated: r.rowCount ?? 0 };
}

export async function confirmProject(db: Queryable, id: string): Promise<{ updated: number }> {
    const r = await db.query(
        `UPDATE projects
            SET is_user_confirmed = TRUE,
                updated_at = NOW()
          WHERE id = $1`,
        [id],
    );
    return { updated: r.rowCount ?? 0 };
}

// ─── Decisions ─────────────────────────────────────────────────────────────

export interface PatchDecisionInput {
    title?:             string | undefined;
    context?:           string | null | undefined;
    decision?:          string | null | undefined;
    consequences?:      string | null | undefined;
    confidence?:        string | undefined;
    is_user_confirmed?: boolean | undefined;
}

export async function patchDecision(
    db: Queryable,
    projectId: string,
    decisionId: string,
    input: PatchDecisionInput,
): Promise<{ updated: number }> {
    const sets: string[]   = [];
    const params: unknown[] = [];
    let idx = 1;
    const add = (col: string, value: unknown) => {
        sets.push(`${col} = $${idx++}`);
        params.push(value);
    };
    if (input.title             !== undefined) add('title',             input.title);
    if (input.context           !== undefined) add('context',           input.context);
    if (input.decision          !== undefined) add('decision',          input.decision);
    if (input.consequences      !== undefined) add('consequences',      input.consequences);
    if (input.confidence        !== undefined) add('confidence',        input.confidence);
    if (input.is_user_confirmed !== undefined) add('is_user_confirmed', input.is_user_confirmed);
    if (sets.length === 0) return { updated: 0 };

    sets.push('updated_at = NOW()');
    params.push(decisionId, projectId);
    const r = await db.query(
        `UPDATE project_decisions
            SET ${sets.join(', ')}
          WHERE id = $${idx} AND project_id = $${idx + 1}`,
        params,
    );
    return { updated: r.rowCount ?? 0 };
}

export async function deleteDecision(
    db: Queryable,
    projectId: string,
    decisionId: string,
): Promise<{ deleted: number }> {
    const r = await db.query(
        `DELETE FROM project_decisions
          WHERE id = $1 AND project_id = $2`,
        [decisionId, projectId],
    );
    return { deleted: r.rowCount ?? 0 };
}

// ─── Architecture ──────────────────────────────────────────────────────────

export interface PatchArchitectureInput {
    diagram_format?: 'mermaid' | 'svg' | undefined;
    diagram_source?: string | undefined;
    nodes?:          unknown[] | undefined;
    edges?:          unknown[] | undefined;
}

export async function patchArchitecture(
    db: Queryable,
    projectId: string,
    input: PatchArchitectureInput,
): Promise<{ updated: number }> {
    const sets: string[]   = [`is_user_edited = TRUE`, `generated_at = NOW()`];
    const params: unknown[] = [];
    let idx = 1;
    if (input.diagram_format !== undefined) { sets.push(`diagram_format = $${idx++}`); params.push(input.diagram_format); }
    if (input.diagram_source !== undefined) { sets.push(`diagram_source = $${idx++}`); params.push(input.diagram_source); }
    if (input.nodes          !== undefined) { sets.push(`nodes = $${idx++}::jsonb`);   params.push(JSON.stringify(input.nodes)); }
    if (input.edges          !== undefined) { sets.push(`edges = $${idx++}::jsonb`);   params.push(JSON.stringify(input.edges)); }
    params.push(projectId);
    const r = await db.query(
        `UPDATE project_architecture
            SET ${sets.join(', ')}
          WHERE project_id = $${idx}`,
        params,
    );
    return { updated: r.rowCount ?? 0 };
}

// ─── Merge + split ─────────────────────────────────────────────────────────

/**
 * Merge one or more source projects' components into a target project.
 * Source projects are then archived (status='archived'). Children of the
 * target are untouched. Returns counts for observability.
 *
 * Caller is responsible for ensuring source + target belong to the same
 * user — RLS does the rest.
 */
export async function mergeProjects(
    db: Queryable,
    targetId: string,
    sourceIds: readonly string[],
): Promise<{ componentsReassigned: number; sourcesArchived: number }> {
    if (sourceIds.length === 0) return { componentsReassigned: 0, sourcesArchived: 0 };

    const reassigned = await db.query(
        `UPDATE project_components
            SET project_id = $1
          WHERE project_id = ANY($2::uuid[])`,
        [targetId, sourceIds],
    );
    const archived = await db.query(
        `UPDATE projects
            SET status = 'archived', updated_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [sourceIds],
    );
    // Bump target shape if it now spans multiple components from different repos.
    await db.query(
        `UPDATE projects SET shape = 'multi_repo', updated_at = NOW()
          WHERE id = $1 AND shape = 'single_repo'`,
        [targetId],
    );
    return {
        componentsReassigned: reassigned.rowCount ?? 0,
        sourcesArchived:      archived.rowCount   ?? 0,
    };
}

export interface SplitInput {
    componentIds: readonly string[];
    name:         string;
    slug:         string;
}

/**
 * Carve `componentIds` out of `projectId` and into a brand-new project.
 * The new project shares the source project's user_id (RLS enforces it).
 */
export async function splitProject(
    db: Queryable,
    userId: string,
    projectId: string,
    input: SplitInput,
): Promise<{ newProjectId: string; componentsMoved: number }> {
    const newProjectId = randomUUID();
    await db.query(
        `INSERT INTO projects (
            id, user_id, slug, name, shape, is_ai_suggested, is_user_confirmed,
            status, role_exhibited, visibility
         )
         VALUES (
            $1::uuid, $2::uuid, $3, $4, 'multi_repo', FALSE, TRUE,
            'active', 'sole_builder', 'private'
         )`,
        [newProjectId, userId, input.slug, input.name],
    );
    const reassigned = await db.query(
        `UPDATE project_components
            SET project_id = $1::uuid
          WHERE project_id = $2::uuid
            AND id = ANY($3::uuid[])`,
        [newProjectId, projectId, input.componentIds],
    );
    return { newProjectId, componentsMoved: reassigned.rowCount ?? 0 };
}
