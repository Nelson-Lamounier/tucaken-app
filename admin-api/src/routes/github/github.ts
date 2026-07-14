/**
 * @format
 * admin-api — GitHub domain facade.
 *
 * Composes the GitHub App admin surface from its sub-resource routers and
 * re-exports the domain's public symbols so consumers (index.ts, tests,
 * admin tooling) keep a single stable import path:
 *
 *   createGitHubRouter        — /installation + /repos + /connected-repos/*
 *                               (Cognito JWT, mounted at /api/admin/github)
 *   createGitHubWebhookRouter — POST /webhook (HMAC-verified, unauthenticated,
 *                               mounted at /api/github)
 *
 * Implementation lives in installation.ts, connected-repos.ts, webhook.ts
 * and the route-private helpers in github-shared.ts.
 */
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { createConnectedReposRouter } from './connected-repos.js';
import { createInstallationRouter } from './installation.js';

export { createGitHubWebhookRouter } from './webhook.js';
export { deleteConnection } from '../../lib/github/connection.js';
export { buildTechExtractJobSpec, connectRepoWithDefaultProject } from './github-shared.js';

export function createGitHubRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();
    router.route('/', createInstallationRouter(config));
    router.route('/', createConnectedReposRouter(config));
    return router;
}
