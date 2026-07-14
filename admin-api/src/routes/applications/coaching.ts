/**
 * @format
 * admin-api — Interview coaching routes.
 *
 * Routes (mounted under /api/admin/applications by the applications.ts facade):
 *   POST /:slug/coach            — schedule the coach K8s Job
 *   GET  /:slug/coaching/:stage  — read the generated coaching_content row
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { getJobImage, isImageConfigured } from '../../lib/config.js';
import { dispatchCoach } from '../../lib/jobs/coach-dispatch.js';
import { getPool, withUser } from '../../lib/pg.js';
import { getApplication } from '../../lib/repositories/applications.js';
import { linkCoachRun } from '../../lib/repositories/interview-stages.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { makeCoachAdapters } from './applications-shared.js';

export function createApplicationsCoachingRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const app = new Hono<AdminApiBindings>();

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
