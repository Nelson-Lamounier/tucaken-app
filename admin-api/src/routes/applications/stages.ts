/**
 * @format
 * admin-api — Interview stage routes.
 *
 * Routes (mounted under /api/admin/applications by the applications.ts facade):
 *   PATCH /:slug/stages/:stage          — per-stage user state / schedule / N/A
 *   PATCH /:slug/stages/:stage/outcome  — set per-stage analytics outcome
 *   PUT   /:slug/stages/:stage/feedback — upsert per-stage feedback capture
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { dispatchCoach, isPrepStage } from '../../lib/jobs/coach-dispatch.js';
import { getPool, withUser } from '../../lib/pg.js';
import { advanceStatusOffAnalysis, getApplication } from '../../lib/repositories/applications.js';
import {
  upsertStageUserState,
  markNotApplicable as pgMarkNotApplicable,
  linkCoachRun,
  setStageOutcome,
  isStageOutcome,
  STAGE_OUTCOMES,
} from '../../lib/repositories/interview-stages.js';
import {
  upsertStageFeedback,
  InvalidStageFeedbackError,
} from '../../lib/repositories/stage-feedback.js';
import type { StageFeedbackInput } from '../../lib/repositories/stage-feedback.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { makeCoachAdapters } from './applications-shared.js';

export function createApplicationsStagesRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const app = new Hono<AdminApiBindings>();

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

      // Scheduling a stage means interview prep has begun — move off the transient
      // analysis status so the list stops reading "Ready for Review".
      if (body.scheduleAt) {
        await advanceStatusOffAnalysis(db, application.id);
      }

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


  // ── PATCH /:slug/stages/:stage/outcome — set per-stage analytics outcome ───
  app.patch('/:slug/stages/:stage/outcome', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);

    const slug  = ctx.req.param('slug');
    const stage = ctx.req.param('stage');

    let body: { outcome?: unknown };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    if (!isStageOutcome(body.outcome)) {
      return ctx.json({ error: `Invalid outcome. Expected one of: ${STAGE_OUTCOMES.join(', ')}` }, 400);
    }

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      await setStageOutcome(db, application.id, stage, body.outcome as (typeof STAGE_OUTCOMES)[number]);
      return ctx.json({ success: true });
    });
  });

  // ── PUT /:slug/stages/:stage/feedback — upsert per-stage feedback capture ───
  app.put('/:slug/stages/:stage/feedback', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);

    const slug  = ctx.req.param('slug');
    const stage = ctx.req.param('stage');

    let body: StageFeedbackInput;
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      try {
        await upsertStageFeedback(db, application.id, stage, userId, body);
      } catch (err) {
        if (err instanceof InvalidStageFeedbackError) {
          return ctx.json({ error: err.message }, 400);
        }
        throw err;
      }
      return ctx.json({ success: true });
    });
  });


  return app;
}
