/** @format */
import type { Queryable } from '../pg.js';

export type PrepStatus = 'none' | 'queued' | 'ready' | 'failed';

/** Map coach pipeline_runs.status (+ coaching_content presence) → UI prep_status. */
export function reconcilePrepStatus(coachRunStatus: string | null, hasContent: boolean): PrepStatus {
  if (!coachRunStatus) return 'none';
  if (coachRunStatus === 'failed') return 'failed';
  if (coachRunStatus === 'complete') return hasContent ? 'ready' : 'queued';
  return 'queued';
}

export async function upsertStageUserState(
  db: Queryable,
  appId: string,
  stage: string,
  userState: Record<string, unknown>,
  scheduledAt: string | null,
): Promise<void> {
  await db.query(
    `INSERT INTO interview_stages (job_application_id, stage_type, user_state, scheduled_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (job_application_id, stage_type) DO UPDATE SET
       user_state   = EXCLUDED.user_state,
       scheduled_at = COALESCE(EXCLUDED.scheduled_at, interview_stages.scheduled_at)`,
    [appId, stage, JSON.stringify(userState), scheduledAt],
  );
}

export async function markNotApplicable(db: Queryable, appId: string, stage: string): Promise<void> {
  await db.query(
    `INSERT INTO interview_stages (job_application_id, stage_type, stage_status)
     VALUES ($1, $2, 'not_applicable')
     ON CONFLICT (job_application_id, stage_type) DO UPDATE SET stage_status = 'not_applicable'`,
    [appId, stage],
  );
}

/** Link a dispatched coach run to its stage row (cache prep_status='queued'). */
export async function linkCoachRun(
  db: Queryable,
  appId: string,
  stage: string,
  coachRunId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO interview_stages (job_application_id, stage_type, coach_run_id, prep_status, stage_status)
     VALUES ($1, $2, $3, 'queued',
             COALESCE((SELECT stage_status FROM interview_stages WHERE job_application_id=$1 AND stage_type=$2), 'current'))
     ON CONFLICT (job_application_id, stage_type) DO UPDATE SET
       coach_run_id = EXCLUDED.coach_run_id, prep_status = 'queued'`,
    [appId, stage, coachRunId],
  );
}

/** Advance lifecycle: demote the prior current stage to completed, set the new stage current. */
export async function advanceStageLifecycle(db: Queryable, appId: string, newStage: string): Promise<void> {
  await db.query(
    `UPDATE interview_stages SET stage_status = 'completed'
      WHERE job_application_id = $1 AND stage_status = 'current' AND stage_type <> $2`,
    [appId, newStage],
  );
  await db.query(
    `INSERT INTO interview_stages (job_application_id, stage_type, stage_status)
     VALUES ($1, $2, 'current')
     ON CONFLICT (job_application_id, stage_type) DO UPDATE SET stage_status = 'current'`,
    [appId, newStage],
  );
}

export interface StageRow {
  stage_type: string;
  stage_status: string;
  prep_status: PrepStatus;
  scheduled_at: string | null;
  user_state: Record<string, unknown>;
  coach_run_id: string | null;
}

interface StageQueryRow {
  stage_type: string;
  stage_status: string;
  scheduled_at: string | null;
  user_state: Record<string, unknown> | null;
  coach_run_id: string | null;
  coach_status: string | null;
  has_content: boolean;
}

/** Per-stage rows for an app, reconciling prep_status from coach run + coaching_content. */
export async function getStagesForApp(db: Queryable, appId: string): Promise<StageRow[]> {
  const r = await db.query<StageQueryRow>(
    `SELECT s.stage_type, s.stage_status, s.scheduled_at, s.user_state, s.coach_run_id,
            pr.status AS coach_status,
            EXISTS (
              SELECT 1 FROM coaching_content c
               WHERE c.job_application_id = s.job_application_id AND c.stage_type = s.stage_type
            ) AS has_content
       FROM interview_stages s
       LEFT JOIN pipeline_runs pr ON pr.id = s.coach_run_id
      WHERE s.job_application_id = $1`,
    [appId],
  );
  return r.rows.map(row => ({
    stage_type: row.stage_type,
    stage_status: row.stage_status,
    prep_status: reconcilePrepStatus(row.coach_status, row.has_content),
    scheduled_at: row.scheduled_at,
    user_state: row.user_state ?? {},
    coach_run_id: row.coach_run_id,
  }));
}
