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

import type { V1Job } from '@kubernetes/client-node';
import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { getJobImage, isImageConfigured, isAssetsBucketConfigured } from '../lib/config.js';
import { analysisModeFor, entitlementsFromConfig } from '../lib/entitlements.js';
import { claimStrategistDispatch } from '../lib/strategist-dispatch-gate.js';
import { getCachedTierConfig } from '../lib/tier-config-cache.js';
import { buildPipelineJob, sanitizeLabel } from '../lib/k8s-job-builder.js';
import { getBatchApi } from '../lib/k8s.js';
import { getPool, withUser } from '../lib/pg.js';
import { upsertApplication } from '../lib/repositories/applications.js';
import { upsertArticle } from '../lib/repositories/articles.js';
import { insertPipelineRun, getPipelineRun } from '../lib/repositories/pipeline-runs.js';
import { getUserPlanStatus, checkAndIncrementResumeQuota, decrementResumeQuota } from '../lib/repositories/users.js';
import { secondsUntilNextMonthUTC } from '../lib/retry-after.js';
import type { AdminApiBindings } from '../lib/types.js';

/**
 * Resolve the article-pipeline image URI, or `null` when the admin-api-job-images
 * Secret has not synced yet. Shared by the article-job and article-eval-job
 * routes, which dispatch the same image. Logs the unresolved value on miss.
 */
function resolveArticlePipelineImage(logTag: string): string | null {
  const image = getJobImage('article-pipeline');
  if (!isImageConfigured(image)) {
    console.error(`[${logTag}] image URI unresolved — admin-api-job-images Secret not yet synced`, { value: image });
    return null;
  }
  return image;
}

/**
 * Create a K8s Job, returning false (and logging) on failure. Shared dispatch
 * scaffolding so each route does not re-implement the BatchV1 call + error path.
 */
async function createPipelineJob(namespace: string, job: V1Job, logTag: string): Promise<boolean> {
  try {
    await getBatchApi().createNamespacedJob({ namespace, body: job });
    return true;
  } catch (err: unknown) {
    console.error(`[${logTag}] failed to create K8s Job`, err);
    return false;
  }
}

/**
 * Create the pipelines admin router.
 *
 * @param config - Resolved application configuration
 * @returns Hono router with pipeline trigger routes
 */
/** Minimum gap between a user's strategist runs — throttles rapid re-triggers. */
const STRATEGIST_MIN_DISPATCH_INTERVAL_SEC = 15;

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

    const articlePipelineImage = resolveArticlePipelineImage('pipelines/article-job');
    if (!articlePipelineImage) {
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
          // Stamp the exact article-pipeline image this run will execute, so a
          // run's code version is always queryable from its metadata — never
          // inferred from deploy timelines. Mirrors the strategist route.
          metadata:      { s3Bucket, s3SourceKey, mode, dispatchedImage: articlePipelineImage },
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
          authorId:     userId,
          destinations: ['portfolio'],
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
          // Ground the research agent on the user KB (pgvector) rather than the
          // legacy Bedrock KB. USER_ID above is required by the pgvector path and
          // is already set; without this env the agent defaults to 'bedrock-kb',
          // which has no KNOWLEDGE_BASE_ID here and so retrieves nothing.
          { name: 'RESEARCH_RETRIEVAL_SOURCE', value: config.researchRetrievalSource },
          { name: 'FOUNDATION_MODEL', value: config.foundationModel },
          { name: 'QA_MODEL',         value: config.foundationModel },
          { name: 'AWS_REGION',       value: config.awsRegion },
        ],
        envFromSecretRefs:   ['platform-rds-credentials'],
      });

      if (!(await createPipelineJob(config.articlePipelineNamespace, job, 'pipelines/article-job'))) {
        return ctx.json({ error: 'Failed to schedule pipeline Job' }, 502);
      }

      return ctx.json({ status: 'queued', pipelineRunId, jobName: job.metadata!.name!, slug }, 202);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/admin/pipelines/article-eval-job
  // Dispatch the article-pipeline per-phase LIVE evals (research grounding +
  // writer quality + QA judge) as a one-shot K8s Job. Reuses the SAME image, SA
  // and platform-rds-credentials secret as a real article run, so the evals
  // exercise the live pgvector KB + Bedrock exactly as production does. Runs the
  // `dist/run-evals.js` entrypoint instead of the pipeline; writes pass/fail to
  // its pipeline_runs row (poll via GET /runs/:id). On-demand only — never on a
  // schedule and never in GitHub CI (where article generation must not happen).
  // -------------------------------------------------------------------------
  router.post('/article-eval-job', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const articlePipelineImage = resolveArticlePipelineImage('pipelines/article-eval-job');
    if (!articlePipelineImage) {
      return ctx.json({ error: 'Article pipeline image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
    }

    const pipelineRunId = randomUUID();

    return withUser(getPool(config), userId, async (db) => {
      try {
        await insertPipelineRun(db, {
          id:            pipelineRunId,
          userId,
          pipelineType:  'article-eval',
          referenceId:   userId,
          metadata:      { dispatchedImage: articlePipelineImage },
        });
      } catch (err: unknown) {
        console.error('[pipelines/article-eval-job] failed to insert pipeline_run', err);
        return ctx.json({ error: 'Failed to record pipeline run' }, 500);
      }

      const suffixInput = `${pipelineRunId}:eval:${Date.now()}`;
      const job = buildPipelineJob({
        namespace:           config.articlePipelineNamespace,
        image:               articlePipelineImage,
        serviceAccountName:  config.articlePipelineServiceAccount,
        nameStem:            `article-eval-${sanitizeLabel(userId)}`,
        suffixInput,
        labels:              { app: 'article-pipeline', userId, job: 'eval' },
        // Same image, different entrypoint: run the evals, not the pipeline.
        command:             ['node', 'dist/run-evals.js'],
        env: [
          { name: 'PIPELINE_RUN_ID',  value: pipelineRunId },
          { name: 'USER_ID',          value: userId },
          // Writer + QA evals invoke Bedrock; the research eval only needs pgvector.
          { name: 'FOUNDATION_MODEL', value: config.foundationModel },
          { name: 'QA_MODEL',         value: config.foundationModel },
          { name: 'AWS_REGION',       value: config.awsRegion },
        ],
        envFromSecretRefs:   ['platform-rds-credentials'],
      });

      if (!(await createPipelineJob(config.articlePipelineNamespace, job, 'pipelines/article-eval-job'))) {
        return ctx.json({ error: 'Failed to schedule eval Job' }, 502);
      }

      return ctx.json({ status: 'queued', pipelineRunId, jobName: job.metadata!.name! }, 202);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/admin/pipelines/strategist-job
  // Phase 4: K8s-Job-based strategist pipeline trigger.
  // -------------------------------------------------------------------------
  router.post('/strategist-job', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    let body: { targetCompany?: string; targetRole?: string; jobDescription?: string; mode?: string; resumeId?: string; interviewStage?: string };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    const targetCompany  = body.targetCompany?.trim();
    const targetRole     = body.targetRole?.trim();
    const jobDescription = body.jobDescription?.trim();

    for (const [k, v] of Object.entries({ targetCompany, targetRole, jobDescription })) {
      if (!v) return ctx.json({ error: `"${k}" is required` }, 400);
    }
    const resumeId = body.resumeId?.trim() || '';

    // Reject oversized job descriptions rather than silently truncating (a
    // truncated JD yields a degraded analysis the user never asked for, and an
    // unbounded body is an abuse vector). The 100KB cap keeps us under the K8s
    // env-var 128KB limit with headroom for the other env vars.
    const MAX_JD_BYTES = 100_000;
    const jdBytes = Buffer.byteLength(jobDescription!, 'utf8');
    if (jdBytes > MAX_JD_BYTES) {
      return ctx.json({
        error: `Job description is too long (${Math.ceil(jdBytes / 1000)}KB; max ${MAX_JD_BYTES / 1000}KB). Please shorten it.`,
      }, 400);
    }

    const strategistPipelineImage = getJobImage('job-strategist');
    if (!isImageConfigured(strategistPipelineImage)) {
      console.error('[pipelines/strategist-job] image URI unresolved — admin-api-job-images Secret not yet synced', { value: strategistPipelineImage });
      return ctx.json({ error: 'Strategist pipeline image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
    }

    const applicationId = randomUUID();
    const pipelineRunId = randomUUID();

    const pool = getPool(config);

    return withUser(pool, userId, async (db) => {
      // ── Quota guard: enforce per-plan monthly resume-generation limit ──────
      // Run plan-status read and quota writes on the superuser pool (pool), not
      // the RLS-scoped tucaken_app connection (db). Every other caller of
      // getUserPlanStatus uses the superuser pool; the ingestion quota likewise
      // runs on the raw pool. The quota SQL scopes by user_id=$1 explicitly, so
      // RLS is not needed for correctness here.
      const planStatus = await getUserPlanStatus(pool, userId);
      const role = planStatus?.role ?? null;
      // Authoritative analysis tier, derived from the user's effective plan —
      // NOT the request body or any A/B allowlist. Only premium (and full-access
      // admins) get the full 'standard' research pipeline; free/pro/trial get
      // the lighter 'free' pipeline.
      const mode = analysisModeFor(planStatus?.effectivePlan ?? 'free', role);
      const tierConfig = await getCachedTierConfig(pool);
      const cap = entitlementsFromConfig(tierConfig, planStatus?.effectivePlan ?? 'free', role).resumesPerMonth;
      const allowed = await checkAndIncrementResumeQuota(pool, userId, cap);
      if (!allowed) {
        ctx.header('Retry-After', String(secondsUntilNextMonthUTC()));
        return ctx.json({
          error: 'Free tier allows 1 resume generation per month. Upgrade for unlimited.',
          upgradeUrl: '/pricing',
        }, 429);
      }

      // ── Abuse guard: one in-flight analysis per user + a short throttle ─────
      // Race-safe via a per-user advisory lock inside THIS transaction, so a
      // burst of concurrent triggers (multiple tabs/devices/scripts) cannot each
      // spawn a Job. Refund the quota credit we just took on any rejection.
      const gate = await claimStrategistDispatch(db, userId, STRATEGIST_MIN_DISPATCH_INTERVAL_SEC);
      if (gate !== 'ok') {
        await decrementResumeQuota(pool, userId).catch(() => {});
        if (gate === 'in_flight') {
          return ctx.json({ error: 'An analysis is already running. Wait for it to finish before starting another.' }, 409);
        }
        ctx.header('Retry-After', String(STRATEGIST_MIN_DISPATCH_INTERVAL_SEC));
        return ctx.json({ error: 'You are starting analyses too quickly. Please wait a few seconds and try again.' }, 429);
      }

      // Create the job_applications row before dispatching the K8s Job so the
      // pipeline can UPDATE kanban_status as it progresses.
      try {
        await upsertApplication(db, {
          id:             applicationId,
          userId,
          company:        targetCompany!,
          role:           targetRole!,
          jobUrl:         null,
          jobDescription: jobDescription!,
          kanbanStatus:   'analysing',
          interviewStage: 'applied',
          appliedAt:      null,
          coverLetterOverride: null,
        });
      } catch (err: unknown) {
        console.error('[pipelines/strategist-job] failed to insert job_application', err);
        await decrementResumeQuota(pool, userId).catch(() => {});
        return ctx.json({ error: 'Failed to create application record' }, 500);
      }

      // Seed interview_stage + completed stage rows for any stages before startStage.
      const stageOrder = ['applied', 'phone-screen', 'technical', 'system-design', 'behavioural', 'bar-raiser', 'final'];
      const startStage = (body.interviewStage ?? 'applied').trim();
      const startIdx = Math.max(0, stageOrder.indexOf(startStage) === -1 ? 0 : stageOrder.indexOf(startStage));
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

      try {
        await insertPipelineRun(db, {
          id:           pipelineRunId,
          userId,
          pipelineType: 'strategist',
          referenceId:  applicationId,
          // Stamp the exact job-strategist image this run will execute, so a run's
          // code version is always queryable from its metadata — never inferred
          // from deploy timelines (which led to a behaviour misattribution before).
          metadata:     { applicationSlug: applicationId, targetCompany, targetRole, mode, dispatchedImage: strategistPipelineImage },
        });
      } catch (err: unknown) {
        console.error('[pipelines/strategist-job] failed to insert pipeline_run', err);
        await decrementResumeQuota(pool, userId).catch(() => {});
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
          { name: 'JOB_DESCRIPTION',    value: jobDescription! },
          { name: 'MODE',               value: mode },
          // Matcher runs on Sonnet (config.strategistResearchModel), NOT the
          // shared article-pipeline Haiku — nuanced structured brief, unstable
          // on Haiku. See AdminApiConfig.strategistResearchModel.
          { name: 'RESEARCH_MODEL',     value: config.strategistResearchModel },
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
        await decrementResumeQuota(pool, userId).catch(() => {});
        // Mark the just-inserted run failed so the in-flight guard does not lock
        // the user out of retrying (the row commits with this tx).
        await db.query(`UPDATE pipeline_runs SET status = 'failed', error_message = 'dispatch_failed', updated_at = NOW() WHERE id = $1`, [pipelineRunId]).catch(() => {});
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
