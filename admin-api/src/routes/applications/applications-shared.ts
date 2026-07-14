/**
 * @format
 * admin-api — Applications route-private shared helpers.
 *
 * Coach-dispatch adapters shared by the stages, status and coaching handlers.
 */
import type { AdminApiConfig } from '../../lib/config.js';
import { getJobImage } from '../../lib/config.js';
import type { CoachJobEnv } from '../../lib/jobs/coach-dispatch.js';
import { buildPipelineJob, sanitizeLabel } from '../../lib/jobs/k8s-job-builder.js';
import { getBatchApi } from '../../lib/jobs/k8s.js';
import type { Queryable } from '../../lib/pg.js';
import { insertPipelineRun } from '../../lib/repositories/pipeline-runs.js';

// ── Shared coach dispatch helpers ─────────────────────────────────────────────

/**
 * Builds the `createJob` closure and `insertCoachRun` adapter shared by both
 * the `/coach` and `/status` handlers so K8s job construction is not duplicated.
 */
export function makeCoachAdapters(config: AdminApiConfig, slug: string) {
  function createJob(env: CoachJobEnv): Promise<void> {
    const job = buildPipelineJob({
      namespace:          config.strategistPipelineNamespace,
      image:              getJobImage('job-strategist'),
      serviceAccountName: config.strategistPipelineServiceAccount,
      nameStem:           `coach-${sanitizeLabel(slug)}-${sanitizeLabel(env.interviewStage)}`,
      suffixInput:        `${env.coachPipelineRunId}:${env.applicationId}:${env.interviewStage}:${Date.now()}`,
      labels: {
        app:   'coach-pipeline',
        userId: env.userId,
        slug:  sanitizeLabel(slug),
        stage: sanitizeLabel(env.interviewStage),
      },
      command: ['node', 'dist/run-coach.js'],
      env: [
        { name: 'COACH_PIPELINE_RUN_ID',      value: env.coachPipelineRunId },
        { name: 'STRATEGIST_PIPELINE_RUN_ID', value: env.strategistPipelineRunId },
        { name: 'APPLICATION_ID',             value: env.applicationId },
        { name: 'APPLICATION_SLUG',           value: env.slug },
        { name: 'USER_ID',                    value: env.userId },
        { name: 'TARGET_COMPANY',             value: env.targetCompany },
        { name: 'TARGET_ROLE',                value: env.targetRole },
        { name: 'JOB_DESCRIPTION',            value: env.jobDescription },
        { name: 'INTERVIEW_STAGE',            value: env.interviewStage },
        { name: 'MODE',                       value: 'standard' },
        { name: 'COACH_MODEL',                value: config.coachModel },
        ...(env.compensationTarget ? [{ name: 'COMPENSATION_TARGET', value: env.compensationTarget }] : []),
        { name: 'REGION',                     value: env.region },
      ],
      envFromSecretRefs: ['platform-rds-credentials'],
    });
    return getBatchApi().createNamespacedJob({ namespace: config.strategistPipelineNamespace, body: job }).then(() => undefined);
  }

  function insertCoachRunAdapter(
    db: Queryable,
    row: { id: string; userId: string; referenceId: string; metadata: Record<string, unknown> },
  ): Promise<void> {
    return insertPipelineRun(db, {
      id:           row.id,
      userId:       row.userId,
      pipelineType: 'coach',
      referenceId:  row.referenceId,
      metadata:     row.metadata,
    });
  }

  return { createJob, insertCoachRunAdapter };
}

