/**
 * @format
 * admin-api — Pipeline trigger routes (K8s Job-based).
 *
 * Routes (all protected by Cognito JWT middleware):
 *
 *   POST /api/admin/pipelines/article-job/:slug — Trigger article-pipeline K8s Job
 *   POST /api/admin/pipelines/strategist-job    — Trigger strategist-pipeline K8s Job
 *   GET  /api/admin/pipelines/runs/:id          — Poll pipeline_runs row
 *
 * The legacy Lambda-based article/strategist routes were removed in Phase 5;
 * pipeline execution now runs entirely as Kubernetes Jobs.
 */

import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import type { PoolClient } from 'pg';

import type { AdminApiConfig } from '../lib/config.js';
import { getJobImage, isImageConfigured, isAssetsBucketConfigured } from '../lib/config.js';
import { buildPipelineJob, sanitizeLabel } from '../lib/k8s-job-builder.js';
import { getBatchApi } from '../lib/k8s.js';
import { getPool, withUser } from '../lib/pg.js';
import { upsertApplication } from '../lib/repositories/applications.js';
import { upsertArticle } from '../lib/repositories/articles.js';
import { insertPipelineRun, getPipelineRun } from '../lib/repositories/pipeline-runs.js';
import type { AdminApiBindings } from '../lib/types.js';

/** UUID shape guard — mirrors the projects router's local helper. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Guard against the K8s env-var 128KB limit — truncate at 100KB with a warning. */
function truncateJobDescription(jobDescription: string): string {
  const MAX_JD_BYTES = 100_000;
  const jdBytes = Buffer.byteLength(jobDescription, 'utf8');
  if (jdBytes <= MAX_JD_BYTES) return jobDescription;
  console.warn('[pipelines/strategist-job] job description truncated', { originalBytes: jdBytes });
  return jobDescription.substring(0, MAX_JD_BYTES);
}

type ReanalysisInputs =
  | { targetCompany: string; targetRole: string; jobDescription: string }
  | { error: string; status: 404 | 409 | 422 };

/**
 * Load the stored inputs for a re-analysis — RLS scopes the SELECT to the
 * caller, so a foreign applicationId reads as not-found rather than leaking
 * data. Flips kanban_status to 'analysing' on success so the card reflects
 * the run immediately and a double-click cannot dispatch twice (the second
 * call hits the 409 guard).
 */
async function loadReanalysisInputs(db: PoolClient, applicationId: string): Promise<ReanalysisInputs> {
  const res = await db.query(
    `SELECT company, role, job_description, kanban_status FROM job_applications WHERE id = $1`,
    [applicationId],
  );
  if (res.rowCount === 0) return { error: 'Application not found', status: 404 };
  const row = res.rows[0] as { company: string; role: string; job_description: string | null; kanban_status: string };
  if (row.kanban_status === 'analysing') {
    return { error: 'An analysis is already running for this application', status: 409 };
  }
  if (!row.job_description?.trim()) {
    return { error: 'Application has no stored job description to re-analyse', status: 422 };
  }
  await db.query(`UPDATE job_applications SET kanban_status = 'analysing' WHERE id = $1`, [applicationId]);
  return { targetCompany: row.company, targetRole: row.role, jobDescription: row.job_description.trim() };
}

/**
 * New-analysis path: create the job_applications row before dispatching the
 * K8s Job so the pipeline can UPDATE kanban_status as it progresses, then
 * seed interview_stage + completed stage rows for any stages before the
 * requested start stage.
 */
async function createApplicationWithStages(db: PoolClient, params: {
  applicationId: string;
  userId: string;
  targetCompany: string;
  targetRole: string;
  jobDescription: string;
  interviewStage: string | undefined;
}): Promise<{ ok: boolean }> {
  const { applicationId, userId, targetCompany, targetRole, jobDescription } = params;
  try {
    await upsertApplication(db, {
      id:             applicationId,
      userId,
      company:        targetCompany,
      role:           targetRole,
      jobUrl:         null,
      jobDescription,
      kanbanStatus:   'analysing',
      interviewStage: 'applied',
      appliedAt:      null,
    });
  } catch (err: unknown) {
    console.error('[pipelines/strategist-job] failed to insert job_application', err);
    return { ok: false };
  }

  const stageOrder = ['applied', 'phone-screen', 'technical', 'system-design', 'behavioural', 'bar-raiser', 'final'];
  const startStage = (params.interviewStage ?? 'applied').trim();
  const foundIdx = stageOrder.indexOf(startStage);
  const startIdx = Math.max(0, foundIdx);
  await db.query(`UPDATE job_applications SET interview_stage = $1 WHERE id = $2`, [stageOrder[startIdx], applicationId]);
  for (let i = 0; i < startIdx; i++) {
    await db.query(
      `INSERT INTO interview_stages (job_application_id, stage_type, stage_status)
       VALUES ($1,$2,'completed') ON CONFLICT (job_application_id, stage_type) DO NOTHING`,
      [applicationId, stageOrder[i]],
    );
  }
  if (startIdx > 0) {
    await db.query(
      `INSERT INTO interview_stages (job_application_id, stage_type, stage_status)
       VALUES ($1,$2,'current') ON CONFLICT (job_application_id, stage_type) DO UPDATE SET stage_status='current'`,
      [applicationId, stageOrder[startIdx]],
    );
  }
  return { ok: true };
}

/**
 * Create the pipelines admin router.
 *
 * @param config - Resolved application configuration
 * @returns Hono router with pipeline trigger routes
 */
export function createPipelinesRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  // -------------------------------------------------------------------------
  // POST /api/admin/pipelines/article-job/:slug
  // Phase 4: K8s-Job-based article pipeline trigger.
  // -------------------------------------------------------------------------
  router.post('/article-job/:slug', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');

    let body: { mode?: string } = {};
    try { body = await ctx.req.json(); }
    catch { /* empty body is fine — all required values come from config + slug */ }

    if (!isAssetsBucketConfigured(config.assetsBucketName)) {
      return ctx.json({ error: 'Article pipeline unavailable — assets S3 bucket not configured' }, 503);
    }

    const s3Bucket    = config.assetsBucketName!;
    const s3SourceKey = `drafts/${slug}.md`;
    const mode        = body.mode?.trim() || 'kb-augmented';

    const articlePipelineImage = getJobImage('article-pipeline');
    if (!isImageConfigured(articlePipelineImage)) {
      console.error('[pipelines/article-job] image URI unresolved — admin-api-job-images Secret not yet synced', { value: articlePipelineImage });
      return ctx.json({ error: 'Article pipeline image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
    }

    const pipelineRunId = randomUUID();

    return withUser(getPool(config), userId, async (db) => {
      try {
        await insertPipelineRun(db, {
          id:            pipelineRunId,
          userId,
          pipelineType:  'article',
          referenceId:   slug,
          metadata:      { s3Bucket, s3SourceKey, mode },
        });
      } catch (err: unknown) {
        console.error('[pipelines/article-job] failed to insert pipeline_run', err);
        return ctx.json({ error: 'Failed to record pipeline run' }, 500);
      }

      // Pre-create article placeholder so status polling returns 'processing'
      // during the pipeline run. The K8s Job's persistArticle overwrites this
      // with the generated content when complete.
      try {
        await upsertArticle(db, {
          slug,
          title:       slug,
          excerpt:     null,
          contentMd:   '',
          tags:        [],
          status:      'processing',
          aiGenerated: true,
          aiModel:     null,
          publishedAt: null,
          coverImage:  null,
          authorId:    userId,
        });
      } catch (err: unknown) {
        console.error('[pipelines/article-job] failed to upsert article placeholder', err);
        return ctx.json({ error: 'Failed to create article record' }, 500);
      }

      const suffixInput = `${pipelineRunId}:${slug}:${Date.now()}`;
      const job = buildPipelineJob({
        namespace:           config.articlePipelineNamespace,
        image:               articlePipelineImage,
        serviceAccountName:  config.articlePipelineServiceAccount,
        nameStem:            `article-${sanitizeLabel(slug)}`,
        suffixInput,
        labels:              { app: 'article-pipeline', userId, slug: sanitizeLabel(slug) },
        command:             ['node', 'dist/run-pipeline.js'],
        env: [
          { name: 'PIPELINE_RUN_ID',  value: pipelineRunId },
          { name: 'SLUG',             value: slug },
          { name: 'S3_BUCKET',        value: s3Bucket },
          { name: 'S3_SOURCE_KEY',    value: s3SourceKey },
          { name: 'USER_ID',          value: userId },
          { name: 'MODE',             value: mode },
          { name: 'RESEARCH_MODEL',   value: config.researchModel },
          { name: 'FOUNDATION_MODEL', value: config.foundationModel },
          { name: 'QA_MODEL',         value: config.foundationModel },
          { name: 'AWS_REGION',       value: config.awsRegion },
        ],
        envFromSecretRefs:   ['platform-rds-credentials'],
      });

      try { await getBatchApi().createNamespacedJob({ namespace: config.articlePipelineNamespace, body: job }); }
      catch (err: unknown) {
        console.error('[pipelines/article-job] failed to create K8s Job', err);
        return ctx.json({ error: 'Failed to schedule pipeline Job' }, 502);
      }

      return ctx.json({ status: 'queued', pipelineRunId, jobName: job.metadata!.name!, slug }, 202);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/admin/pipelines/strategist-job
  // Phase 4: K8s-Job-based strategist pipeline trigger.
  //
  // Two body variants:
  //   { targetCompany, targetRole, jobDescription, ... } — new analysis:
  //     creates the job_applications row and seeds interview stages.
  //   { applicationId } — RE-analysis of an existing application: company,
  //     role, and job description are read from the stored row (RLS-scoped to
  //     the caller), no new application row is created, stages are untouched,
  //     and the fresh run lands on the SAME application card.
  // -------------------------------------------------------------------------
  router.post('/strategist-job', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    let body: { targetCompany?: string; targetRole?: string; jobDescription?: string; mode?: string; resumeId?: string; interviewStage?: string; applicationId?: string };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    const reanalyseId = body.applicationId?.trim();
    const isReanalysis = Boolean(reanalyseId);
    if (isReanalysis && !isUuid(reanalyseId)) {
      return ctx.json({ error: '"applicationId" must be a UUID' }, 400);
    }

    let targetCompany  = body.targetCompany?.trim();
    let targetRole     = body.targetRole?.trim();
    let jobDescription = body.jobDescription?.trim();

    if (!isReanalysis) {
      for (const [k, v] of Object.entries({ targetCompany, targetRole, jobDescription })) {
        if (!v) return ctx.json({ error: `"${k}" is required` }, 400);
      }
    }
    const mode = body.mode?.trim() || 'standard';

    const resumeId = body.resumeId?.trim() || '';

    const strategistPipelineImage = getJobImage('job-strategist');
    if (!isImageConfigured(strategistPipelineImage)) {
      console.error('[pipelines/strategist-job] image URI unresolved — admin-api-job-images Secret not yet synced', { value: strategistPipelineImage });
      return ctx.json({ error: 'Strategist pipeline image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
    }

    const applicationId = reanalyseId ?? randomUUID();
    const pipelineRunId = randomUUID();

    return withUser(getPool(config), userId, async (db) => {
      if (isReanalysis) {
        const loaded = await loadReanalysisInputs(db, applicationId);
        if ('error' in loaded) return ctx.json({ error: loaded.error }, loaded.status);
        ({ targetCompany, targetRole, jobDescription } = loaded);
      } else {
        const created = await createApplicationWithStages(db, {
          applicationId, userId,
          targetCompany:  targetCompany!,
          targetRole:     targetRole!,
          jobDescription: jobDescription!,
          interviewStage: body.interviewStage,
        });
        if (!created.ok) return ctx.json({ error: 'Failed to create application record' }, 500);
      }

      // Applied after the reanalysis branch so the stored-JD path is guarded too.
      const truncatedJd = truncateJobDescription(jobDescription!);

      try {
        await insertPipelineRun(db, {
          id:           pipelineRunId,
          userId,
          pipelineType: 'strategist',
          referenceId:  applicationId,
          metadata:     { applicationSlug: applicationId, targetCompany, targetRole, mode, ...(isReanalysis ? { reanalysis: true } : {}) },
        });
      } catch (err: unknown) {
        console.error('[pipelines/strategist-job] failed to insert pipeline_run', err);
        return ctx.json({ error: 'Failed to record pipeline run' }, 500);
      }

      const suffixInput = `${pipelineRunId}:${applicationId}:${Date.now()}`;
      const job = buildPipelineJob({
        namespace:           config.strategistPipelineNamespace,
        image:               strategistPipelineImage,
        serviceAccountName:  config.strategistPipelineServiceAccount,
        nameStem:            `strategist-${sanitizeLabel(applicationId)}`,
        suffixInput,
        labels:              { app: 'strategist-pipeline', userId, applicationSlug: sanitizeLabel(applicationId) },
        command:             ['node', 'dist/run-pipeline.js'],
        env: [
          { name: 'PIPELINE_RUN_ID',    value: pipelineRunId },
          { name: 'APPLICATION_ID',     value: applicationId },
          { name: 'APPLICATION_SLUG',   value: applicationId },
          { name: 'USER_ID',            value: userId },
          { name: 'TARGET_COMPANY',     value: targetCompany! },
          { name: 'TARGET_ROLE',        value: targetRole! },
          { name: 'JOB_DESCRIPTION',    value: truncatedJd },
          { name: 'MODE',               value: mode },
          { name: 'RESEARCH_MODEL',     value: config.researchModel },
          // Filter-then-rank retrieval gate (Increment 2). Read by the strategist
          // pod at run-pipeline.ts; absent ⇒ pure-vector retrieval (fail-open).
          // Forwarded from the admin-api env so the ephemeral Job inherits the flag.
          { name: 'RETRIEVAL_PREFILTER', value: process.env['RETRIEVAL_PREFILTER'] ?? 'off' },
          { name: 'AWS_REGION',         value: config.awsRegion },
          ...(resumeId ? [{ name: 'RESUME_ID', value: resumeId }] : []),
        ],
        envFromSecretRefs: ['platform-rds-credentials'],
      });

      try { await getBatchApi().createNamespacedJob({ namespace: config.strategistPipelineNamespace, body: job }); }
      catch (err: unknown) {
        console.error('[pipelines/strategist-job] failed to create K8s Job', err);
        return ctx.json({ error: 'Failed to schedule pipeline Job' }, 502);
      }

      return ctx.json({
        status:           'queued',
        pipelineRunId,
        jobName:          job.metadata!.name!,
        applicationId,
        applicationSlug:  applicationId,
      }, 202);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/pipelines/runs/:id
  // Phase 4: poll the pipeline_runs row.
  // -------------------------------------------------------------------------
  router.get('/runs/:id', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const id = ctx.req.param('id');

    return withUser(getPool(config), userId, async (db) => {
      const run = await getPipelineRun(db, id);
      if (!run) return ctx.json({ error: 'Pipeline run not found' }, 404);
      // RLS already isolates to this user's rows; explicit check retained as defence-in-depth.
      if (run.userId !== userId) return ctx.json({ error: 'Forbidden' }, 403);
      return ctx.json({ run });
    });
  });

  return router;
}
