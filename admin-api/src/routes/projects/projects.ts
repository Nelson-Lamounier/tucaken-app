/**
 * @format
 * admin-api — Projects domain facade.
 *
 * Composes the projects surface from its sub-resource routers so consumers
 * (index.ts, tests) keep a single stable import path.
 *
 * Mount order matters: the clustering router registers the literal paths
 * (/clustering/proposals, /clustering/run) BEFORE the core router's /:id
 * parameter routes so they are never captured as project ids.
 *
 * RLS enforcement: every DB call in the sub-routers runs inside
 * `withUser(pool, userId, fn)` so the connection runs as the low-privilege
 * `tucaken_app` role with `app.current_user_id` set to the caller's users.id.
 *
 * Implementation lives in core.ts, architecture.ts, decisions.ts,
 * clustering.ts and the route-private validators in projects-shared.ts.
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { createProjectsArchitectureRouter } from './architecture.js';
import { createProjectsClusteringRouter } from './clustering.js';
import { createProjectsCoreRouter } from './core.js';
import { createProjectsDecisionsRouter } from './decisions.js';

export function createProjectsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();
    router.route('/', createProjectsClusteringRouter(config));
    router.route('/', createProjectsCoreRouter(config));
    router.route('/', createProjectsDecisionsRouter(config));
    router.route('/', createProjectsArchitectureRouter(config));
    return router;
}
