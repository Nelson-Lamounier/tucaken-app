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

/**
 * Per-user project slug from a repo full_name. Mirrors migration 031:
 * lower-case, non-[a-z0-9] runs → single dash, trim leading/trailing dashes.
 */
export function deriveRepoSlug(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ensure a repo has a default single_repo project. Mirrors migration 031 for
 * one repo. Idempotent: no-ops if the repo already has any project_repositories
 * link. Runs against the caller's Queryable (Pool or PoolClient) — the caller
 * owns the transaction so repo-insert + project-create commit/rollback together.
 */
export async function ensureDefaultProject(
  db: Queryable,
  userId: string,
  repositoryId: string,
  repoFullName: string,
): Promise<void> {
  const guard = await db.query(
    `SELECT 1 FROM project_repositories WHERE repository_id = $1::uuid LIMIT 1`,
    [repositoryId],
  );
  if ((guard.rowCount ?? 0) > 0) return;

  const slug = deriveRepoSlug(repoFullName);
  const name = repoFullName.split('/')[1] || repoFullName;

  // Upsert the project and ALWAYS read back the real id. A repo removed earlier
  // can leave a project row behind (the repo link is gone, but the project +
  // slug remain), so a fresh randomUUID() + DO NOTHING would skip the insert and
  // then the component insert would reference a non-existent project id (FK
  // violation). DO UPDATE ... RETURNING id yields the existing OR new id.
  const projectRes = await db.query<{ id: string }>(
    `INSERT INTO projects (
        id, user_id, slug, name, shape, is_ai_suggested, is_user_confirmed,
        status, role_exhibited, visibility
     ) VALUES (
        $1::uuid, $2::uuid, $3, $4, 'single_repo', FALSE, FALSE,
        'active', 'sole_builder', 'private'
     )
     ON CONFLICT (user_id, slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [randomUUID(), userId, slug, name],
  );
  const projectId = projectRes.rows[0]?.id;
  if (!projectId) throw new Error('ensureDefaultProject: project upsert returned no id');

  // Reuse the project's existing default component if it already has one
  // (orphan case); otherwise create it. Avoids a duplicate 'Main' component.
  const compRes = await db.query<{ id: string }>(
    `SELECT id FROM project_components WHERE project_id = $1::uuid ORDER BY order_index LIMIT 1`,
    [projectId],
  );
  const existingComponent = compRes.rows[0];
  let componentId: string;
  if (existingComponent) {
    componentId = existingComponent.id;
  } else {
    componentId = randomUUID();
    await db.query(
      `INSERT INTO project_components (id, user_id, project_id, name, kind, order_index)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Main', 'shared', 0)`,
      [componentId, userId, projectId],
    );
  }

  await db.query(
    `INSERT INTO project_repositories (user_id, project_component_id, repository_id, subpath)
     VALUES ($1::uuid, $2::uuid, $3::uuid, '')
     ON CONFLICT (project_component_id, repository_id, subpath) DO NOTHING`,
    [userId, componentId, repositoryId],
  );
}

/**
 * Remove pristine single-repo DEFAULT projects that are left without any repo
 * after a repo is deleted. Scope is deliberately narrow so curated work is never
 * touched: only `shape='single_repo'`, `is_user_confirmed=FALSE`, no case study,
 * and zero remaining repo links. Pass the project ids the deleted repo seeded
 * (captured before the repo row is removed). Idempotent: deleting already-gone
 * rows is a no-op, so it is safe to call on every repo removal.
 *
 * Without this, removing a repo leaves its auto-created project behind — it
 * clutters the project list and gets reused on re-add (so the next add does not
 * start from a clean single-repo project). Returns the ids actually deleted.
 */
export async function cleanupOrphanedDefaultProjects(
  db: Queryable,
  userId: string,
  projectIds: readonly string[],
): Promise<string[]> {
  if (projectIds.length === 0) return [];

  // The shared predicate: a pristine single-repo default with no repo links.
  const pristineOrphan = `
        p.user_id = $1::uuid
    AND p.id = ANY($2::uuid[])
    AND p.shape = 'single_repo'
    AND p.is_user_confirmed = FALSE
    AND p.case_study_status IS NULL
    AND NOT EXISTS (
          SELECT 1 FROM project_repositories pr
            JOIN project_components c2 ON pr.project_component_id = c2.id
           WHERE c2.project_id = p.id
        )`;

  // Components first (no ON DELETE CASCADE is assumed on the FK).
  await db.query(
    `DELETE FROM project_components pc
      WHERE pc.user_id = $1::uuid
        AND pc.project_id IN (SELECT p.id FROM projects p WHERE ${pristineOrphan})`,
    [userId, projectIds],
  );
  const deleted = await db.query<{ id: string }>(
    `DELETE FROM projects p WHERE ${pristineOrphan} RETURNING p.id`,
    [userId, projectIds],
  );
  return deleted.rows.map((r) => r.id);
}

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
    /** Newest successful sync across the project's member repos (null if none). */
    latest_repo_sync_at:      string | null;
    /**
     * True when a member repo synced after the case study was generated — the
     * case study no longer reflects the code and the user should regenerate.
     * Derived (not stored): see `isCaseStudyStale`.
     */
    case_study_stale:         boolean;
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
    /** Last successful ingestion of this repo (repo_sync_state). Null = never. */
    last_synced_at:  string | null;
    /** Current sync state: 'pending' | 'syncing' | 'complete' | 'error' | null. */
    sync_status:     string | null;
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

/**
 * A case study is stale when a member repo synced AFTER it was generated — the
 * generated narrative no longer reflects the code. Pure + null-safe:
 *   - never generated (no timestamp) → not "stale", it's "not generated yet"
 *   - no repo has ever synced → not stale
 * Both timestamps are ISO strings (or null) straight off the row.
 */
export function isCaseStudyStale(
    latestRepoSyncAt: string | null,
    caseStudyGeneratedAt: string | null,
): boolean {
    if (!latestRepoSyncAt || !caseStudyGeneratedAt) return false;
    return new Date(latestRepoSyncAt).getTime() > new Date(caseStudyGeneratedAt).getTime();
}

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
    const total = Number.parseInt(totalResult.rows[0]?.count ?? '0', 10);

    const result = await db.query<Omit<ProjectSummary, 'case_study_stale'>>(
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
              WHERE pc.project_id = p.id) AS repository_count,
            (SELECT MAX(s.last_synced_at)
               FROM project_repositories pr
               JOIN project_components pc ON pc.id = pr.project_component_id
               JOIN repositories r ON r.id = pr.repository_id
               LEFT JOIN repo_sync_state s
                 ON s.user_id = r.user_id AND s.repo_full_name = r.full_name
              WHERE pc.project_id = p.id) AS latest_repo_sync_at
           FROM projects p
           ${where}
           ORDER BY COALESCE(p.last_activity_at, p.created_at) DESC
           LIMIT $1 OFFSET $2`,
        [options.limit, options.offset],
    );
    const rows = result.rows.map((r) => ({
        ...r,
        case_study_stale: isCaseStudyStale(r.latest_repo_sync_at, r.case_study_generated_at),
    }));
    return { total, rows };
}

export async function getProjectDetail(db: Queryable, id: string): Promise<ProjectDetail | null> {
    const project = await db.query<Omit<ProjectSummary, 'case_study_stale' | 'latest_repo_sync_at'> & {
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
                `SELECT pr.project_component_id AS component_id, pr.repository_id,
                        r.full_name AS repository_name, pr.subpath,
                        s.last_synced_at, s.sync_status
                 FROM project_repositories pr
                 JOIN project_components pc ON pc.id = pr.project_component_id
                 JOIN repositories r ON r.id = pr.repository_id
                 LEFT JOIN repo_sync_state s
                   ON s.user_id = r.user_id AND s.repo_full_name = r.full_name
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

    // Newest member-repo sync drives the stale flag — derived from the rows we
    // already fetched (no extra query). Numeric compare so it is robust whether
    // pg hands back ISO strings or Date objects. A repo never synced is null.
    const latest_repo_sync_at = repositories.rows.reduce<string | null>((acc, row) => {
        const t = row.last_synced_at;
        if (!t) return acc;
        if (!acc) return t;
        return new Date(t).getTime() > new Date(acc).getTime() ? t : acc;
    }, null);

    return {
        ...p,
        latest_repo_sync_at,
        case_study_stale: isCaseStudyStale(latest_repo_sync_at, p.case_study_generated_at),
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

/**
 * When a multi_repo proposal is confirmed, archive the now-redundant default
 * single_repo projects for the same repos — but ONLY pristine ones (untouched
 * by the user). Edited/published defaults survive for manual resolution.
 * Returns the archived project ids. Caller runs this inside withUser (RLS).
 */
export async function archiveSupersededDefaults(
  db: Queryable,
  userId: string,
  confirmedProjectId: string,
): Promise<string[]> {
  const r = await db.query<{ id: string }>(
    `UPDATE projects p
        SET status = 'archived', updated_at = NOW()
      WHERE p.user_id = $1::uuid
        AND p.id <> $2::uuid
        AND p.shape = 'single_repo'
        AND p.is_user_confirmed = FALSE
        AND p.case_study_status IS NULL
        AND COALESCE(p.user_overrides, '{}'::jsonb) = '{}'::jsonb
        AND p.status <> 'archived'
        AND EXISTS (
          SELECT 1
            FROM project_repositories def_pr
            JOIN project_components  def_pc ON def_pc.id = def_pr.project_component_id
           WHERE def_pc.project_id = p.id
             AND def_pr.repository_id IN (
               SELECT con_pr.repository_id
                 FROM project_repositories con_pr
                 JOIN project_components  con_pc ON con_pc.id = con_pr.project_component_id
                WHERE con_pc.project_id = $2::uuid
             )
        )
      RETURNING p.id`,
    [userId, confirmedProjectId],
  );
  return r.rows.map((row) => row.id);
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
