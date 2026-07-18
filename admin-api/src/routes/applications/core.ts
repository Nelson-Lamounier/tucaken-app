/**
 * @format
 * admin-api — Application core routes (list, detail, mutate, delete).
 *
 * Routes (mounted under /api/admin/applications by the applications.ts facade):
 *   GET    /                  — list applications
 *   GET    /:slug             — application detail (PG-assembled)
 *   GET    /:slug/resume.pdf  — presigned URL to the canonical ATS text PDF
 *   DELETE /:slug             — delete application
 *   PATCH  /:slug/annotations — replace application-level user annotations
 *   PUT    /:slug/cover-letter — persist the user's cover-letter override
 *   PUT    /:slug/resume      — persist edited tailored resume
 *   POST   /:slug/status      — update status (dispatches coach on prep stages)
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { getJobImage, isImageConfigured, isAssetsBucketConfigured } from '../../lib/config.js';
import { dispatchCoach, isPrepStage } from '../../lib/jobs/coach-dispatch.js';
import { logger } from '../../lib/observability/logger.js';
import { getPool, withUser } from '../../lib/pg.js';
import {
  listApplications,
  getApplication,
  getApplicationStatus,
  updateApplicationStatus as pgUpdateStatus,
  updateInterviewStage,
  deleteApplication as pgDeleteApplication,
  updateApplicationAnnotations,
  updateApplicationCoverLetterOverride,
} from '../../lib/repositories/applications.js';
import { advanceStageLifecycle, getStagesForApp, linkCoachRun } from '../../lib/repositories/interview-stages.js';
import { loadProjectRefIndex, rankProjectsForSkills } from '../../lib/repositories/project-references.js';
import { updateApplicationTailoredResume } from '../../lib/repositories/resumes.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { makeCoachAdapters } from './applications-shared.js';

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

/** Technical round types served to the UI (mirrors ApplicationDetail.technicalRoundType). */
type TechnicalRoundType =
  | 'dsa' | 'practical' | 'take-home' | 'system-design' | 'behavioural' | 'mixed'
  | 'troubleshooting' | 'architecture-review' | 'hands-on-lab';
const VALID_ROUND_TYPES = new Set<TechnicalRoundType>([
  'dsa', 'practical', 'take-home', 'system-design', 'behavioural', 'mixed',
  'troubleshooting', 'architecture-review', 'hands-on-lab',
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
    dimensionMix: raw['dimensionMix'] ?? null,
    companyProblem: raw['companyProblem'] ?? '',
    skillEvidenceLedger: raw['skillEvidenceLedger'] ?? [],
  };

  // Pass dsaTopicCalibration through verbatim when present.
  if (raw['dsaTopicCalibration'] !== undefined) {
    result['dsaTopicCalibration'] = raw['dsaTopicCalibration'];
  }

  // Pass pillarClassification through verbatim when present (S2).
  if (raw['pillarClassification'] !== undefined) {
    result['pillarClassification'] = raw['pillarClassification'];
  }

  // Pass kbRetrievalStats through verbatim — RAG health for the data panel.
  if (raw['kbRetrievalStats'] !== undefined) {
    result['kbRetrievalStats'] = raw['kbRetrievalStats'];
  }

  return result;
}

/**
 * Collect the topic skills (verified + partial + gap) from a normalised research
 * object, for ranking project references. Tolerant of shape — reads `.skill`.
 */
function collectResearchSkills(research: Record<string, unknown>): string[] {
  const skills: string[] = [];
  for (const key of ['verifiedMatches', 'partialMatches', 'gaps']) {
    const arr = research[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const skill = (item as Record<string, unknown>)?.['skill'];
      if (typeof skill === 'string' && skill.trim().length > 0) skills.push(skill);
    }
  }
  return skills;
}

/** S3 client singleton — credentials from IMDS, no explicit config. */
const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'eu-west-1',
});

/** Presigned-URL lifetime for the canonical resume PDF (seconds). */
const RESUME_PDF_PRESIGN_EXPIRY_SECONDS = 300;

export function createApplicationsCoreRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
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
        interviewStage: a.interviewStage,
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
  // ── GET /:slug/status — lightweight pipeline-status probe ────────────────
  // One indexed lookup. Notification watchers poll THIS, never the full
  // detail assembly below (see the pool-saturation incident, 2026-07-18).
  app.get('/:slug/status', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');
    return withUser(getPool(config), userId, async (db) => {
      const status = await getApplicationStatus(db, slug);
      if (status === null) return ctx.json({ error: `Application not found: ${slug}` }, 404);
      return ctx.json({ slug, status });
    });
  });

  app.get('/:slug', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      // All eight reads below are mutually independent. They share the single
      // RLS-scoped client, so node-pg executes them serially server-side —
      // Promise.all pipelines the submissions (no per-await event-loop gap)
      // WITHOUT taking extra pool slots, which is exactly the trade we want
      // after the pool-saturation incident.
      const analysisPromise = db.query<{
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

      const coachingPromise = db.query<{
        stage_type:          string;
        topics_to_study:     unknown;
        expected_questions:  unknown;
        personal_highlights: unknown;
      }>(
        `SELECT stage_type, topics_to_study, expected_questions, personal_highlights
           FROM coaching_content WHERE job_application_id = $1`,
        [slug],
      );

      const resumePromise = db.query<{
        id:             string;
        content_json:   unknown;
        ats_check_json: unknown;
        generated_at:   Date;
      }>(
        `SELECT id, content_json, ats_check_json, generated_at
           FROM resumes WHERE job_application_id = $1
          ORDER BY generated_at DESC LIMIT 1`,
        [slug],
      );

      // Resolve technicalRoundType from company_interview_profiles.
      // company_key is: lowercase + strip non-alphanumeric (mirrors normalizeCompanyKey).
      const companyKey = normalizeCompanyKey(application.company);
      const profilePromise = db.query<{
        process_shape: unknown[] | null;
      }>(
        `SELECT process_shape
           FROM company_interview_profiles
          WHERE company_key = $1
          LIMIT 1`,
        [companyKey],
      );

      // Real-work DSA evidence (RLS — user's own rows, all repos). Fail-open.
      const dsaPromise = (async (): Promise<Array<{
        canonicalName: string;
        matchCount: number;
        topConfidence: number;
        signals: string[];
        samples: { repo: string; file: string; line: number }[];
      }> | undefined> => {
      try {
        // Reuse the outer RLS-scoped client `db` (withUser already SET LOCAL app.current_user_id) —
        // no second pool checkout. dsa_evidence is RLS-protected; the WHERE is belt-and-braces.
        const { rows } = await db.query<{
          dsa_topic: string;
          match_count: string;
          top_confidence: number;
          signals: string[];
          samples: { repo: string; file: string; line: number }[];
        }>(
          `SELECT dsa_topic,
                  COUNT(*)::int                 AS match_count,
                  MAX(confidence)               AS top_confidence,
                  ARRAY_AGG(DISTINCT signal)    AS signals,
                  (ARRAY_AGG(
                     json_build_object('repo', repo_full_name, 'file', file_path, 'line', line_start)
                     ORDER BY confidence DESC))[1:3] AS samples
             FROM dsa_evidence
            WHERE user_id = current_setting('app.current_user_id')::uuid
            GROUP BY dsa_topic`,
        );
        return rows.map((r) => ({
          canonicalName: r.dsa_topic,
          matchCount:    Number(r.match_count),
          topConfidence: r.top_confidence,
          signals:       r.signals ?? [],
          samples:       r.samples ?? [],
        }));
      } catch (err) {
        (ctx.get('logger') ?? logger).warn({ err }, '[dsa] real-work aggregation failed (non-fatal)');
        return undefined;
      }
      })();

      // DevOps real-work evidence: technology_evidence ⋈ technology_ontology ⋈ devops_topic_mappings.
      // Reuses the outer withUser-scoped db client (RLS). Prose-suppressed. Fail-open.
      const devopsPromise = (async (): Promise<Array<{
        canonicalTopicName: string;
        displayName:        string;
        topicGroup:         string;
        artifactCount:      number;
        samples:            { repo: string; file: string; line: number; rawName: string }[];
      }> | undefined> => {
      try {
        const { rows: devopsRows } = await db.query<{
          canonical_topic_name: string;
          display_name:         string;
          topic_group:          string;
          artifact_count:       number;
          samples:              { repo: string; file: string; line: number; rawName: string }[];
        }>(
          `SELECT m.canonical_topic_name, m.display_name, m.topic_group,
                  COUNT(*)::int AS artifact_count,
                  (ARRAY_AGG(json_build_object('repo', e.repo_full_name, 'file', e.file_path,
                                               'line', e.line_start, 'rawName', e.raw_name)
                             ORDER BY e.confidence DESC NULLS LAST))[1:3] AS samples
             FROM technology_evidence e
             JOIN technology_ontology o ON o.id = e.technology_id
             JOIN devops_topic_mappings m
               ON o.category = ANY (SELECT jsonb_array_elements_text(m.mapped_ontology_categories))
               OR o.canonical_name = ANY (SELECT jsonb_array_elements_text(m.mapped_canonicals))
            WHERE e.user_id = current_setting('app.current_user_id')::uuid
              AND e.source_layer NOT IN ('readme','code-prose')
              AND e.file_path !~* '\\.(md|markdown)$'
            GROUP BY m.canonical_topic_name, m.display_name, m.topic_group
            ORDER BY m.topic_group, m.canonical_topic_name`,
        );
        return devopsRows.map((r) => ({
          canonicalTopicName: r.canonical_topic_name,
          displayName:        r.display_name,
          topicGroup:         r.topic_group,
          artifactCount:      Number(r.artifact_count),
          samples:            r.samples ?? [],
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err }, `[devops] evidence aggregation failed (non-fatal): ${msg}`);
        return undefined;
      }
      })();

      // System tours (per-project architecture walkthroughs). RLS-scoped via the
      // outer withUser db client — a user only sees their own tours. Cap 3, newest
      // first. Each row.content is a SystemTour. Fail-open (query error → omit).
      const toursPromise = (async (): Promise<unknown[] | undefined> => {
      try {
        const { rows: tourRows } = await db.query<{ content: unknown }>(
          `SELECT content
             FROM project_system_tours
            WHERE user_id = current_setting('app.current_user_id')::uuid
            ORDER BY generated_at DESC
            LIMIT 3`,
        );
        return tourRows.map((r) => r.content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err }, `[system-tour] serve failed (non-fatal): ${msg}`);
        return undefined;
      }
      })();

      const [analysisResult, coachingResult, resumeResult, profileResult, dsaRealWork, devopsEvidence, systemTours, stages] =
        await Promise.all([
          analysisPromise,
          coachingPromise,
          resumePromise,
          profilePromise,
          dsaPromise,
          devopsPromise,
          toursPromise,
          getStagesForApp(db, application.id),
        ]);
      const latestAnalysis = analysisResult.rows[0] ?? null;
      const rawAnalysis  = latestAnalysis?.metadata?.['analysis']  as Record<string, unknown> | null | undefined;
      const rawResearch  = latestAnalysis?.metadata?.['research']  as Record<string, unknown> | null | undefined;
      const persistedResume = resumeResult.rows[0]?.content_json ?? null;

      // Map research agent output → ResearchOutput shape.
      // Field names differ between the pipeline contract (@bedrock/shared) and
      // the UI types (applications.types.ts), so we normalise here.
      const research = rawResearch ? normaliseResearch(rawResearch) : null;

      // Rank the user's documented projects against the stage topics (verified /
      // partial / gap skills) so the UI can deep-link project references per topic.
      // Deterministic + RLS-scoped + fail-open — empty map on any issue.
      if (research) {
        try {
          const skills = collectResearchSkills(research);
          if (skills.length > 0) {
            const refIndex = await loadProjectRefIndex(db);
            const refs = rankProjectsForSkills(refIndex, skills);
            if (Object.keys(refs).length > 0) research['topicProjectRefs'] = refs;
          }
        } catch (err) {
          console.error('[applications/detail] project-reference ranking failed (non-fatal)', err);
        }
      }

      const processShape = profileResult.rows[0]?.process_shape ?? null;
      // Find the first stage element whose `stage` starts with 'technical'.
      const technicalStage = Array.isArray(processShape)
        ? (processShape as Record<string, unknown>[]).find(
            (s) => typeof s['stage'] === 'string' && s['stage'].startsWith('technical'),
          )
        : null;
      const rawRoundType = technicalStage?.['round_type'];
      const technicalRoundType: TechnicalRoundType =
        typeof rawRoundType === 'string' && VALID_ROUND_TYPES.has(rawRoundType as TechnicalRoundType)
          ? (rawRoundType as TechnicalRoundType)
          : 'dsa';

      // Map strategist output → AnalysisOutput shape expected by the UI.
      // tailoredResume prefers the persisted resumes row (validated JSON) over
      // the raw tailoredResumeData blob stored in pipeline_runs.metadata.
      const analysis = rawAnalysis ? {
        analysisXml:       rawAnalysis['analysisXml'] ?? null,
        coverLetter:       (application.coverLetterOverride ?? rawAnalysis['coverLetter'] ?? null),
        metadata:          rawAnalysis['metadata'] ?? null,
        resumeSuggestions: rawAnalysis['resumeSuggestions'] ?? null,
        tailoredResume:    persistedResume ?? rawAnalysis['tailoredResumeData'] ?? null,
        // ATS check for the persisted tailored resume. Prefer resumes.ats_check_json;
        // fall back to the copy stashed in pipeline_runs.metadata.analysis.atsCheck
        // (so the panel still renders if the RLS-scoped resumes write was lost).
        atsCheck:          resumeResult.rows[0]?.ats_check_json ?? rawAnalysis['atsCheck'] ?? null,
        // Structured JD signal extracted at analyse time (metadata.jdExtraction).
        jdExtraction:      latestAnalysis?.metadata?.['jdExtraction'] ?? null,
        // Years-of-experience gap signal (relevant vs required, framing line).
        yearsGap:          rawAnalysis['yearsGap'] ?? null,
        // Recruiter snapshot (metadata.analysis.recruiterSnapshot) — hybrid score + missing keywords + red flags.
        recruiterSnapshot: rawAnalysis['recruiterSnapshot'] ?? null,
        // Free-tier evidence-fit score (metadata.analysis.evidenceFit) — deterministic
        // candidate-side JD coverage. Null on the paid path (it has the matcher ledger).
        evidenceFit:       rawAnalysis['evidenceFit'] ?? null,
        // Phase-3 gap defences (metadata.analysis.gapMitigations) — rendered on the Skills gaps card.
        gapMitigations:    rawAnalysis['gapMitigations'] ?? null,
      } : null;



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
          ...(dsaRealWork !== undefined ? { dsaRealWork } : {}),
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
          ...(devopsEvidence !== undefined ? { devopsEvidence } : {}),
          ...(systemTours !== undefined ? { systemTours } : {}),
          stages:              Object.fromEntries(stages.map(s => [s.stage_type, s])),
          userAnnotations:     application.userAnnotations ?? {},
        },
      });
    });
  });

  // ── GET /:slug/resume.pdf — presigned URL to the canonical ATS text PDF ──
  /**
   * Returns a short-lived presigned GET URL for the resume's canonical
   * text-selectable PDF (rendered server-side by the strategist pipeline and
   * stored at `resumes.pdf_s3_key`). The lookup is RLS-scoped via
   * {@link withUser}, so a caller can only reach their own resume.
   *
   * 404 when the resume has no `pdf_s3_key` yet (older runs, or a run before the
   * ATS store was wired) — the client falls back to client-side rendering.
   * Registered before `/:slug` semantics are unaffected because the extra
   * `/resume.pdf` segment makes this a distinct, more specific route.
   */
  app.get('/:slug/resume.pdf', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    if (!isAssetsBucketConfigured(config.assetsBucketName)) {
      return ctx.json({ error: 'Resume PDF unavailable — S3 bucket not configured' }, 503);
    }
    const bucket = config.assetsBucketName;

    const slug = ctx.req.param('slug');

    return withUser(getPool(config), userId, async (db) => {
      const result = await db.query<{ pdf_s3_key: string | null }>(
        `SELECT pdf_s3_key FROM resumes WHERE job_application_id = $1
          ORDER BY generated_at DESC LIMIT 1`,
        [slug],
      );
      const key = result.rows[0]?.pdf_s3_key ?? null;
      if (!key) {
        return ctx.json(
          { error: 'No ATS PDF for this resume yet — regenerate the resume to produce one' },
          404,
        );
      }

      // Force a download (not inline) with a friendly filename. The presign is
      // cross-origin (S3), so an <a download> attribute is ignored client-side —
      // Content-Disposition on the signed URL is the only reliable way to name it.
      const rawName = ctx.req.query('filename');
      const safeName = (rawName ?? 'resume').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'resume';

      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${safeName}.pdf"`,
          ResponseContentType: 'application/pdf',
        }),
        { expiresIn: RESUME_PDF_PRESIGN_EXPIRY_SECONDS },
      );
      return ctx.json({ url, expiresIn: RESUME_PDF_PRESIGN_EXPIRY_SECONDS });
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


  // ── PATCH /:slug/annotations — replace the application-level user annotations ──
  app.patch('/:slug/annotations', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

    const slug = ctx.req.param('slug');

    let body: { annotations?: Record<string, unknown> };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      await updateApplicationAnnotations(db, application.id, body.annotations ?? {});
      return ctx.json({ success: true });
    });
  });

  // ── PUT /:slug/cover-letter — persist the user's cover-letter override ──
  app.put('/:slug/cover-letter', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);

    const slug = ctx.req.param('slug');

    let body: { coverLetter?: unknown };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    const coverLetter = (body.coverLetter ?? null) as Record<string, unknown> | null;

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      await updateApplicationCoverLetterOverride(db, application.id, coverLetter);
      return ctx.json({ success: true });
    });
  });

  // ── PUT /:slug/resume — persist edited tailored resume to the resumes row ──
  app.put('/:slug/resume', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);

    const slug = ctx.req.param('slug');

    let body: { resume?: unknown };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    if (body.resume === null || body.resume === undefined || typeof body.resume !== 'object') {
      return ctx.json({ error: 'resume must be an object' }, 400);
    }
    const resume = body.resume as Record<string, unknown>;

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      const label = `${application.company} — ${application.role}`;
      await updateApplicationTailoredResume(db, application.id, userId, label, resume);
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


  return app;
}
