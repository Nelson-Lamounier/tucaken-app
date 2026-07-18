/**
 * @format
 * Shared per-domain error boundary for Hono routers.
 *
 * Every domain router mounts this via `router.onError(domainErrorBoundary(tag))`
 * so all thrown errors surface with one JSON shape ({ error }) and are logged
 * through the request-bound Pino logger (request_id + trace_id attached by the
 * observability middleware) instead of console.error. Upstream status codes on
 * the error object (`err.status`) are preserved; everything else is a 500.
 * The client never receives a stack trace — only the error message.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { logger as rootLogger } from './observability/logger.js';

export function domainErrorBoundary(tag: string) {
  return (err: Error, ctx: Context): Response => {
    const status = ((err as { status?: number }).status ?? 500) as ContentfulStatusCode;
    // Request-bound logger when the observability middleware has run;
    // root logger as a safety net (e.g. unit tests mounting the router bare).
    const log = ctx.get('logger') ?? rootLogger;
    log.error(
      { err, status, domain: tag, method: ctx.req.method, path: ctx.req.path },
      `${tag} route error`,
    );
    return ctx.json({ error: err.message }, status);
  };
}
