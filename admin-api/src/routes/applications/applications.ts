/**
 * @format
 * admin-api — Applications domain facade.
 *
 * Composes the applications surface from its sub-resource routers so
 * consumers (index.ts, tests) keep a single stable import path.
 *
 * Mount order matters: the analytics router registers the literal paths
 * (/analytics/funnel, /scheduled-interviews) BEFORE the core router's
 * /:slug parameter route so they are never captured as slugs.
 *
 * Implementation lives in core.ts, stages.ts, coaching.ts, analytics.ts and
 * the route-private helpers in applications-shared.ts.
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { createApplicationsAnalyticsRouter } from './analytics.js';
import { createApplicationsCoachingRouter } from './coaching.js';
import { createApplicationsCoreRouter } from './core.js';
import { createApplicationsStagesRouter } from './stages.js';

export function createApplicationsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
  const app = new Hono<AdminApiBindings>();
  app.route('/', createApplicationsAnalyticsRouter(config));
  app.route('/', createApplicationsCoreRouter(config));
  app.route('/', createApplicationsStagesRouter(config));
  app.route('/', createApplicationsCoachingRouter(config));
  return app;
}
