/** @format */
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../pg.js';

export const INTERVIEW_PREP_STAGES = [
  'phone-screen', 'technical', 'system-design', 'behavioural', 'bar-raiser', 'final',
] as const;

export function isPrepStage(stage: string): boolean {
  return (INTERVIEW_PREP_STAGES as readonly string[]).includes(stage);
}

/** Latest COMPLETE strategist run id for an application (reference_id = app UUID). */
export async function resolveStrategistRunId(db: Queryable, applicationId: string): Promise<string | null> {
  const r = await db.query<{ id: string }>(
    `SELECT id FROM pipeline_runs
      WHERE pipeline_type = 'strategist' AND reference_id = $1 AND status = 'complete'
      ORDER BY created_at DESC LIMIT 1`,
    [applicationId],
  );
  return r.rows[0]?.id ?? null;
}

/** True if a coach for (app, stage) is queued/coaching or already complete (dedup). */
export async function coachInFlightOrFresh(db: Queryable, applicationId: string, stage: string): Promise<boolean> {
  const r = await db.query<{ status: string }>(
    `SELECT status FROM pipeline_runs
      WHERE pipeline_type = 'coach' AND reference_id = $1
        AND metadata->>'interviewStage' = $2
        AND status IN ('queued','coaching','complete')
      LIMIT 1`,
    [applicationId, stage],
  );
  return r.rows.length > 0;
}

export interface DispatchResult {
  status: 'dispatched' | 'skipped' | 'gated' | 'no-analysis';
  coachPipelineRunId?: string;
  reason?: string;
}

export interface CoachJobEnv {
  coachPipelineRunId: string; strategistPipelineRunId: string; applicationId: string;
  slug: string; userId: string; targetCompany: string; targetRole: string;
  jobDescription: string; interviewStage: string; compensationTarget: string; region: string;
}

/**
 * Self-resolving, deduped, gated coach dispatch. `createJob` (K8s) and `insertCoachRun`
 * (pipeline_runs INSERT) are injected so this stays unit-testable. Never throws on
 * gate/dedup/no-analysis — returns a structured result.
 */
export async function dispatchCoach(
  db: Queryable,
  args: {
    application: { id: string; company: string; role: string; job_description: string };
    slug: string; userId: string; interviewStage: string;
    compensationTarget?: string; region?: string; force?: boolean;
  },
  createJob: (env: CoachJobEnv) => Promise<void>,
  insertCoachRun: (db: Queryable, row: { id: string; userId: string; referenceId: string; metadata: Record<string, unknown> }) => Promise<void>,
): Promise<DispatchResult> {
  if (!isPrepStage(args.interviewStage)) return { status: 'gated', reason: `not an interview-prep stage: ${args.interviewStage}` };
  if (!args.force && await coachInFlightOrFresh(db, args.application.id, args.interviewStage)) {
    return { status: 'skipped', reason: 'coach already in-flight or complete for this stage' };
  }
  const strategistPipelineRunId = await resolveStrategistRunId(db, args.application.id);
  if (!strategistPipelineRunId) return { status: 'no-analysis', reason: 'no complete strategist run yet' };

  const coachPipelineRunId = randomUUID();
  await insertCoachRun(db, {
    id: coachPipelineRunId, userId: args.userId, referenceId: args.application.id,
    metadata: { applicationSlug: args.slug, interviewStage: args.interviewStage, strategistPipelineRunId },
  });
  await createJob({
    coachPipelineRunId, strategistPipelineRunId, applicationId: args.application.id, slug: args.slug,
    userId: args.userId, targetCompany: args.application.company, targetRole: args.application.role,
    jobDescription: args.application.job_description, interviewStage: args.interviewStage,
    compensationTarget: args.compensationTarget ?? '', region: args.region ?? 'eu-remote',
  });
  return { status: 'dispatched', coachPipelineRunId };
}
