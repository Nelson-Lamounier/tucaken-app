/**
 * @format
 * ApplicationRepository — typed pg queries for the job_applications table.
 */
import type { Queryable } from '../pg.js';

export interface Application {
    id:             string;
    userId:         string | null;
    company:        string;
    role:           string;
    jobUrl:         string | null;
    jobDescription: string;
    kanbanStatus:   string;
    interviewStage: string;
    appliedAt:      Date | null;
    userAnnotations?: Record<string, unknown>;
    coverLetterOverride: Record<string, unknown> | null;
    createdAt?:     Date | undefined;
    updatedAt?:     Date | undefined;
}

const LIST_APPLICATIONS_LIMIT = 200;

function rowToApplication(row: Record<string, unknown>): Application {
    return {
        id:             row['id']               as string,
        userId:         row['user_id']          as string | null,
        company:        row['company']          as string,
        role:           row['role']             as string,
        jobUrl:         row['job_url']          as string | null,
        jobDescription: row['job_description']  as string,
        kanbanStatus:   row['kanban_status']    as string,
        // Prefer the derived furthest-reached stage (from interview_stages) over the
        // manual pointer, which only advances on an explicit "Advance" click.
        interviewStage: (row['reached_stage'] as string | null | undefined)
                        ?? (row['interview_stage'] as string | null | undefined) ?? 'applied',
        userAnnotations: (row['user_annotations'] as Record<string, unknown> | null | undefined) ?? {},
        coverLetterOverride: (row['cover_letter_override'] ?? null) as Record<string, unknown> | null,
        appliedAt:      row['applied_at']       ? new Date(row['applied_at']  as string) : null,
        createdAt:      row['created_at']       ? new Date(row['created_at']  as string) : undefined,
        updatedAt:      row['updated_at']       ? new Date(row['updated_at']  as string) : undefined,
    };
}

export async function upsertApplication(pool: Queryable, application: Application): Promise<void> {
    await pool.query(
        `INSERT INTO job_applications
             (id, user_id, company, role, job_url, job_description, kanban_status, interview_stage, applied_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
             company         = EXCLUDED.company,
             role            = EXCLUDED.role,
             job_url         = EXCLUDED.job_url,
             job_description = EXCLUDED.job_description,
             kanban_status   = EXCLUDED.kanban_status,
             interview_stage = EXCLUDED.interview_stage,
             applied_at      = EXCLUDED.applied_at,
             updated_at      = NOW()`,
        [
            application.id,
            application.userId ?? null,
            application.company,
            application.role,
            application.jobUrl ?? null,
            application.jobDescription,
            application.kanbanStatus,
            application.interviewStage ?? 'applied',
            application.appliedAt ?? null,
        ],
    );
}

export async function getApplication(pool: Queryable, id: string): Promise<Application | null> {
    const result = await pool.query(
        `SELECT id, user_id, company, role, job_url, job_description,
                kanban_status, interview_stage, applied_at, user_annotations, cover_letter_override, created_at, updated_at
         FROM job_applications WHERE id = $1`,
        [id],
    );
    if (result.rows.length === 0) return null;
    return rowToApplication(result.rows[0] as Record<string, unknown>);
}

/** Replace the application-level user annotations blob (keyed by insight item id). */
export async function updateApplicationAnnotations(
    pool: Queryable,
    id: string,
    annotations: Record<string, unknown>,
): Promise<void> {
    await pool.query(
        `UPDATE job_applications SET user_annotations = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [id, JSON.stringify(annotations)],
    );
}

/** Persist a user-authored cover letter override (or clear it by passing null). */
export async function updateApplicationCoverLetterOverride(
    pool: Queryable,
    id: string,
    coverLetter: Record<string, unknown> | null,
): Promise<void> {
    await pool.query(
        `UPDATE job_applications SET cover_letter_override = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [id, JSON.stringify(coverLetter)],
    );
}

/**
 * The furthest hiring stage an application has actually reached: the latest (by
 * canonical order) of the manual `interview_stage` pointer and any stage that has
 * been engaged in `interview_stages` (coach ran, user scheduled, or advanced).
 * Correlated subquery referencing the outer `ja` alias.
 */
const REACHED_STAGE_SQL = `(
        SELECT cand.st FROM (
          SELECT ja.interview_stage AS st
          UNION ALL
          SELECT s.stage_type
            FROM interview_stages s
           WHERE s.job_application_id = ja.id
             AND (s.coach_run_id IS NOT NULL OR s.scheduled_at IS NOT NULL OR s.stage_status IN ('current','completed'))
          UNION ALL
          SELECT c.stage_type
            FROM coaching_content c
           WHERE c.job_application_id = ja.id
        ) cand
        ORDER BY array_position(
          ARRAY['applied','phone-screen','technical','system-design','behavioural','bar-raiser','final']::text[],
          cand.st
        ) DESC NULLS LAST
        LIMIT 1
      ) AS reached_stage`;

const APPLICATION_COLUMNS = `ja.id, ja.user_id, ja.company, ja.role, ja.job_url, ja.job_description,
                ja.kanban_status, ja.interview_stage, ja.applied_at, ja.created_at, ja.updated_at`;

export async function listApplications(pool: Queryable, kanbanStatus?: string): Promise<Application[]> {
    if (kanbanStatus !== undefined) {
        const result = await pool.query(
            `SELECT ${APPLICATION_COLUMNS}, ${REACHED_STAGE_SQL}
             FROM job_applications ja WHERE ja.kanban_status = $1 ORDER BY ja.created_at DESC LIMIT ${LIST_APPLICATIONS_LIMIT}`,
            [kanbanStatus],
        );
        return (result.rows as Record<string, unknown>[]).map(rowToApplication);
    }
    const result = await pool.query(
        `SELECT ${APPLICATION_COLUMNS}, ${REACHED_STAGE_SQL}
         FROM job_applications ja ORDER BY ja.created_at DESC LIMIT ${LIST_APPLICATIONS_LIMIT}`,
    );
    return (result.rows as Record<string, unknown>[]).map(rowToApplication);
}

export async function updateApplicationStatus(pool: Queryable, id: string, kanbanStatus: string): Promise<void> {
    await pool.query(
        `UPDATE job_applications SET kanban_status = $1, updated_at = NOW() WHERE id = $2`,
        [kanbanStatus, id],
    );
}

/**
 * Advance an application off the transient analysis states once interview prep
 * begins. `analysing` / `analysis-ready` are only meaningful while the Research
 * Agent runs; scheduling a stage means the candidate is past that, so move to
 * `interview-prep`. Idempotent and never overrides a status the user set.
 */
export async function advanceStatusOffAnalysis(pool: Queryable, id: string): Promise<void> {
    await pool.query(
        `UPDATE job_applications SET kanban_status = 'interview-prep', updated_at = NOW()
          WHERE id = $1 AND kanban_status IN ('analysing', 'analysis-ready')`,
        [id],
    );
}

export async function deleteApplication(pool: Queryable, id: string): Promise<void> {
    await pool.query(`DELETE FROM job_applications WHERE id = $1`, [id]);
}

export async function updateInterviewStage(pool: Queryable, id: string, stage: string): Promise<void> {
    await pool.query(
        `UPDATE job_applications SET interview_stage = $1, updated_at = NOW() WHERE id = $2`,
        [stage, id],
    );
}
