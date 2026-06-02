/**
 * @format
 * admin-api — Applications routes (PG-only after Phase 5).
 *
 * Exposes CRUD operations for the Job Applications pipeline data stored
 * in PostgreSQL. All routes are protected by Cognito JWT middleware
 * mounted at the parent level.
 *
 * Routes:
 *   GET    /                              — list applications (optional ?status= filter)
 *   GET    /:slug                         — full application detail (PG-assembled)
 *   DELETE /:slug                         — delete application
 *   POST   /:slug/status                  — update application status
 *   POST   /:slug/coach                   — schedule the coach K8s Job
 *   GET    /:slug/coaching/:stage         — read coaching_content row
 */

import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { getJobImage, isImageConfigured } from '../lib/config.js';
import { dispatchCoach, isPrepStage } from '../lib/coach-dispatch.js';
import type { CoachJobEnv } from '../lib/coach-dispatch.js';
import { buildPipelineJob, sanitizeLabel } from '../lib/k8s-job-builder.js';
import { getBatchApi } from '../lib/k8s.js';
import { getPool, withUser } from '../lib/pg.js';
import type { Queryable } from '../lib/pg.js';
import {
  listApplications,
  getApplication,
  updateApplicationStatus as pgUpdateStatus,
  updateInterviewStage,
  deleteApplication as pgDeleteApplication,
} from '../lib/repositories/applications.js';
import {
  upsertStageUserState,
  markNotApplicable as pgMarkNotApplicable,
  linkCoachRun,
  getStagesForApp,
  advanceStageLifecycle,
} from '../lib/repositories/interview-stages.js';
import { insertPipelineRun } from '../lib/repositories/pipeline-runs.js';
import type { AdminApiBindings } from '../lib/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Application status values matching the pipeline contract. */
const VALID_STATUSES = new Set([
  'analysing',
  'analysis-ready',
  'failed',
  'interview-prep',
  'applied',
  'interviewing',
  'offer-received',
  'accepted',
  'withdrawn',
  'rejected',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalises a company name into a stable key for company_interview_profiles lookup.
 * Rule: lowercase, strip all non-alphanumeric characters.
 * E.g. "Stripe, Inc." → "stripeinc", "Meta Platforms" → "metaplatforms"
 */
function normalizeCompanyKey(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Maps raw research agent output (pipeline field names) to the ResearchOutput
 * shape expected by the UI (applications.types.ts).
 *
 * Key differences:
 *   experienceSignals.domainExperience   → domain
 *   experienceSignals.leadershipExpectation → leadership
 *   experienceSignals.scaleIndicators    → scale
 *   verifiedMatch.depth (SkillDepth)     → depthBadge (string)
 *   skillGap.impactSeverity              → severity
 *   skillGap.impactSeverity === 'blocking' → isDisqualifying
 *   overallFitRating spaces              → underscores (UI FitRating enum)
 *   dsaTopicCalibration                  → passed through verbatim
 */
function normaliseResearch(raw: Record<string, unknown>): Record<string, unknown> {
  const signals = raw['experienceSignals'] as Record<string, unknown> | undefined;

  const fitRatingRaw = raw['overallFitRating'] as string | undefined ?? '';
  const fitRating = fitRatingRaw.replaceAll(' ', '_');

  const verifiedMatches = (raw['verifiedMatches'] as Record<string, unknown>[] | undefined ?? []).map(m => ({
    skill:          m['skill'],
    sourceCitation: m['sourceCitation'],
    depthBadge:     m['depth'],
    recency:        m['recency'],
  }));

  const gaps = (raw['gaps'] as Record<string, unknown>[] | undefined ?? []).map(g => ({
    skill:           g['skill'],
    gapType:         g['gapType'],
    severity:        g['impactSeverity'],
    isDisqualifying: g['impactSeverity'] === 'blocking',
  }));

  const result: Record<string, unknown> = {
    fitSummary:   raw['fitSummary'] ?? '',
    fitRating,
    verifiedMatches,
    partialMatches: raw['partialMatches'] ?? [],
    gaps,
    experienceSignals: signals ? {
      yearsExpected: signals['yearsExpected'],
      domain:        signals['domainExperience'],
      leadership:    signals['leadershipExpectation'],
      scale:         signals['scaleIndicators'],
    } : undefined,
    technologyInventory: raw['technologyInventory'] ?? null,
  };

  // Pass dsaTopicCalibration through verbatim when present.
  if (raw['dsaTopicCalibration'] !== undefined) {
    result['dsaTopicCalibration'] = raw['dsaTopicCalibration'];
  }

  return result;
}

// ── Shared coach dispatch helpers ─────────────────────────────────────────────

/**
 * Builds the `createJob` closure and `insertCoachRun` adapter shared by both
 * the `/coach` and `/status` handlers so K8s job construction is not duplicated.
 */
function makeCoachAdapters(config: AdminApiConfig, slug: string) {
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

// ── Router factory ────────────────────────────────────────────────────────────

/**
 * Creates the Hono router for application management routes.
 *
 * @param config - Validated admin-api configuration
 * @returns Hono router instance
 */
export function createApplicationsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const app = new Hono<AdminApiBindings>();

  // ── GET / — list applications ─────────────────────────────────────────────
  app.get('/', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    return withUser(getPool(config), userId, async (db) => {
      const rawStatus = ctx.req.query('status');
      const apps = await listApplications(db, rawStatus ?? undefined);
      const summaries = apps.map((a) => ({
        slug:           a.id,
        targetCompany:  a.company,
        targetRole:     a.role,
        status:         a.kanbanStatus,
        jobUrl:         a.jobUrl ?? null,
        fitRating:      null,
        recommendation: null,
        interviewStage: 'applied',
        costUsd:        null,
        appliedAt:      a.appliedAt ?? null,
        createdAt:      a.createdAt ?? null,
        updatedAt:      a.updatedAt ?? null,
      }));
      return ctx.json({ applications: summaries, count: summaries.length });
    });
  });

  // ── GET /:slug — application detail (PG) ─────────────────────────────────
  /**
   * Retrieves the full detail for a single application.
   *
   * Note: applications.id is UUID; the admin UI passes the UUID via the
   * `:slug` path parameter (no slug column exists today).
   *
   * Assembles:
   *  - job_applications row (metadata)
   *  - latest pipeline_runs row (analysis JSON in metadata)
   *  - coaching_content rows (one per stage)
   *  - latest resumes row (tailored resume content_json)
   */
  app.get('/:slug', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      const analysisResult = await db.query<{
        id:         string;
        metadata:   Record<string, unknown> | null;
        created_at: Date;
      }>(
        `SELECT id, metadata, created_at
           FROM pipeline_runs
          WHERE pipeline_type = 'strategist' AND reference_id = $1 AND status = 'complete'
          ORDER BY created_at DESC
          LIMIT 1`,
        [slug],
      );
      const latestAnalysis = analysisResult.rows[0] ?? null;

      const coachingResult = await db.query<{
        stage_type:          string;
        topics_to_study:     unknown;
        expected_questions:  unknown;
        personal_highlights: unknown;
      }>(
        `SELECT stage_type, topics_to_study, expected_questions, personal_highlights
           FROM coaching_content WHERE job_application_id = $1`,
        [slug],
      );

      const resumeResult = await db.query<{
        id:           string;
        content_json: unknown;
        generated_at: Date;
      }>(
        `SELECT id, content_json, generated_at
           FROM resumes WHERE job_application_id = $1
          ORDER BY generated_at DESC LIMIT 1`,
        [slug],
      );

      // Resolve technicalRoundType from company_interview_profiles.
      // company_key is: lowercase + strip non-alphanumeric (mirrors normalizeCompanyKey).
      const companyKey = normalizeCompanyKey(application.company);
      const profileResult = await db.query<{
        process_shape: unknown[] | null;
      }>(
        `SELECT process_shape
           FROM company_interview_profiles
          WHERE company_key = $1
          LIMIT 1`,
        [companyKey],
      );
      const processShape = profileResult.rows[0]?.process_shape ?? null;
      // Find the first stage element whose `stage` starts with 'technical'.
      const technicalStage = Array.isArray(processShape)
        ? (processShape as Record<string, unknown>[]).find(
            (s) => typeof s['stage'] === 'string' && s['stage'].startsWith('technical'),
          )
        : null;
      const technicalRoundType: string =
        (technicalStage?.['round_type'] as string | undefined) ?? 'dsa';

      const rawAnalysis  = latestAnalysis?.metadata?.['analysis']  as Record<string, unknown> | null | undefined;
      const rawResearch  = latestAnalysis?.metadata?.['research']  as Record<string, unknown> | null | undefined;
      const persistedResume = resumeResult.rows[0]?.content_json ?? null;

      // Map strategist output → AnalysisOutput shape expected by the UI.
      // tailoredResume prefers the persisted resumes row (validated JSON) over
      // the raw tailoredResumeData blob stored in pipeline_runs.metadata.
      const analysis = rawAnalysis ? {
        analysisXml:       rawAnalysis['analysisXml'] ?? null,
        coverLetter:       rawAnalysis['coverLetter'] ?? null,
        metadata:          rawAnalysis['metadata'] ?? null,
        resumeSuggestions: rawAnalysis['resumeSuggestions'] ?? null,
        tailoredResume:    persistedResume ?? rawAnalysis['tailoredResumeData'] ?? null,
      } : null;

      // Map research agent output → ResearchOutput shape.
      // Field names differ between the pipeline contract (@bedrock/shared) and
      // the UI types (applications.types.ts), so we normalise here.
      const research = rawResearch ? normaliseResearch(rawResearch) : null;

      const stages = await getStagesForApp(db, application.id);

      return ctx.json({
        application: {
          id:                  application.id,
          slug:                application.id,
          targetCompany:       application.company,
          targetRole:          application.role,
          jobUrl:              application.jobUrl,
          jobDescription:      application.jobDescription,
          status:              application.kanbanStatus,
          interviewStage:      application.interviewStage,
          createdAt:           application.createdAt,
          updatedAt:           application.updatedAt,
          context: {
            pipelineId:               latestAnalysis?.id ?? application.id,
            cumulativeInputTokens:    0,
            cumulativeOutputTokens:   0,
            cumulativeThinkingTokens: 0,
            cumulativeCostUsd:        0,
          },
          research,
          analysis,
          technicalRoundType,
          interviewPrep:       null,
          latestAnalysisRunId: latestAnalysis?.id ?? null,
          coaching:            coachingResult.rows.reduce<Record<string, unknown>>((acc, row) => {
            acc[row.stage_type] = {
              topics:    row.topics_to_study,
              questions: row.expected_questions,
              personal:  row.personal_highlights,
            };
            return acc;
          }, {}),
          stages:              Object.fromEntries(stages.map(s => [s.stage_type, s])),
        },
      });
    });
  });

  // ── DELETE /:slug — delete application ────────────────────────────────────
  app.delete('/:slug', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');

    return withUser(getPool(config), userId, async (db) => {
      await pgDeleteApplication(db, slug);
      return ctx.json({ deleted: true, slug });
    });
  });

  // ── PATCH /:slug/stages/:stage — update per-stage user state / schedule / N/A ──
  app.patch('/:slug/stages/:stage', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug  = ctx.req.param('slug');
    const stage = ctx.req.param('stage');

    let body: { userState?: Record<string, unknown>; scheduleAt?: string | null; markNotApplicable?: boolean };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      if (body.markNotApplicable === true) {
        await pgMarkNotApplicable(db, application.id, stage);
        return ctx.json({ success: true });
      }

      await upsertStageUserState(db, application.id, stage, body.userState ?? {}, body.scheduleAt ?? null);

      if (body.scheduleAt && isPrepStage(stage)) {
        const { createJob, insertCoachRunAdapter } = makeCoachAdapters(config, slug);
        try {
          const result = await dispatchCoach(
            db,
            {
              application: { id: application.id, company: application.company, role: application.role, job_description: application.jobDescription },
              slug,
              userId,
              interviewStage: stage,
            },
            createJob,
            insertCoachRunAdapter,
          );
          if (result.status === 'dispatched') {
            await linkCoachRun(db, application.id, stage, result.coachPipelineRunId!);
          }
        } catch (err) {
          console.error('[applications/stages] coach dispatch failed (non-fatal)', err);
        }
      }

      return ctx.json({ success: true });
    });
  });

  // ── POST /:slug/status — update status ────────────────────────────────────
  app.post('/:slug/status', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');
    const body = await ctx.req.json<{ status?: string; interviewStage?: string }>();
    if (!body.status || !VALID_STATUSES.has(body.status)) {
      return ctx.json({ error: `Invalid or missing status: ${body.status ?? '(none)'}` }, 400);
    }

    return withUser(getPool(config), userId, async (db) => {
      await pgUpdateStatus(db, slug, body.status!);

      if (body.interviewStage) {
        const app = await getApplication(db, slug);
        if (app) {
          await updateInterviewStage(db, app.id, body.interviewStage);

          try { await advanceStageLifecycle(db, app.id, body.interviewStage); }
          catch (err) { console.error('[applications/status] stage lifecycle update failed (non-fatal)', err); }

          if (isPrepStage(body.interviewStage)) {
            const coachImageConfigured = isImageConfigured(getJobImage('job-strategist'));
            if (coachImageConfigured) {
              const { createJob, insertCoachRunAdapter } = makeCoachAdapters(config, slug);
              try {
                const result = await dispatchCoach(
                  db,
                  { application: { id: app.id, company: app.company, role: app.role, job_description: app.jobDescription }, slug, userId, interviewStage: body.interviewStage },
                  createJob,
                  insertCoachRunAdapter,
                );
                if (result.status === 'dispatched' && result.coachPipelineRunId) {
                  await linkCoachRun(db, app.id, body.interviewStage, result.coachPipelineRunId);
                }
              } catch (err) {
                console.error('[applications/status] coach dispatch failed (non-fatal)', err);
              }
            }
          }
        }
      }

      return ctx.json({ success: true, status: body.status });
    });
  });

  // ── POST /:slug/coach — schedule the coach K8s Job ───────────────────────
  app.post('/:slug/coach', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');

    let body: {
      interviewStage?:     string;
      compensationTarget?: string | number;
      region?:             string;
      force?:              boolean;
    };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    const strategistPipelineImage = getJobImage('job-strategist');
    if (!isImageConfigured(strategistPipelineImage)) {
      console.error('[applications/coach] image URI unresolved — admin-api-job-images Secret not yet synced', { value: strategistPipelineImage });
      return ctx.json({ error: 'Strategist pipeline image not yet configured — wait ~60s for ESO/kubelet sync' }, 502);
    }

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      const { createJob, insertCoachRunAdapter } = makeCoachAdapters(config, slug);

      const dispatchArgs: Parameters<typeof dispatchCoach>[1] = {
        application: { id: application.id, company: application.company, role: application.role, job_description: application.jobDescription },
        slug,
        userId,
        interviewStage: body.interviewStage?.trim() ?? '',
        force:          body.force === true,
      };
      if (body.compensationTarget != null) {
        dispatchArgs.compensationTarget = String(body.compensationTarget).trim();
      }
      if (body.region?.trim()) {
        dispatchArgs.region = body.region.trim();
      }

      const result = await dispatchCoach(db, dispatchArgs, createJob, insertCoachRunAdapter);

      if (result.status === 'dispatched') {
        if (dispatchArgs.interviewStage) {
          await linkCoachRun(db, application.id, dispatchArgs.interviewStage, result.coachPipelineRunId!);
        }
        return ctx.json({ status: 'queued', coachPipelineRunId: result.coachPipelineRunId }, 202);
      }
      if (result.status === 'skipped') {
        return ctx.json({ status: 'skipped' }, 200);
      }
      if (result.status === 'gated') {
        return ctx.json({ error: result.reason }, 400);
      }
      // no-analysis
      return ctx.json({ error: result.reason }, 409);
    });
  });

  // ── GET /:slug/coaching/:stage — read coaching_content row ────────────────
  app.get('/:slug/coaching/:stage', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const stage = ctx.req.param('stage');
    const applicationId = ctx.req.query('applicationId');
    if (!applicationId) {
      return ctx.json({ error: 'applicationId query param required' }, 400);
    }

    return withUser(getPool(config), userId, async (db) => {
      const result = await db.query<{
        topics_to_study:     unknown;
        expected_questions:  unknown;
        personal_highlights: unknown;
        generated_at:        Date;
      }>(
        `SELECT topics_to_study, expected_questions, personal_highlights, generated_at
         FROM coaching_content WHERE job_application_id = $1 AND stage_type = $2`,
        [applicationId, stage],
      );
      if (result.rows.length === 0) {
        return ctx.json({ error: 'Coaching content not yet ready' }, 404);
      }

      const row = result.rows[0]!;
      return ctx.json({
        applicationId,
        stage,
        coaching:           row.topics_to_study,
        questions:          row.expected_questions,
        personalHighlights: row.personal_highlights,
        generatedAt:        row.generated_at,
      });
    });
  });

  return app;
}
