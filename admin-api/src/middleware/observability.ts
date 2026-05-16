/**
 * @format
 * admin-api — Hono observability middleware.
 *
 * Responsibilities:
 *   1. Generate or propagate `x-request-id` (passed back in the response).
 *   2. Record RED metrics (rate / errors / duration) per route.
 *   3. Bind a pino child logger to ctx with request_id + trace_id.
 *   4. Emit one JSON access log per request at completion.
 *   5. Emit a `Server-Timing` header so Faro RUM correlates to Tempo.
 */

import { randomUUID } from 'node:crypto';

import { trace } from '@opentelemetry/api';
import type { MiddlewareHandler } from 'hono';

import { logger as rootLogger } from '../lib/observability/logger.js';
import { httpRequestsTotal, httpRequestDurationSeconds } from '../lib/observability/metrics.js';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
    logger:    typeof rootLogger;
  }
}

export const observabilityMiddleware: MiddlewareHandler = async (ctx, next) => {
  const start     = process.hrtime.bigint();
  const requestId = ctx.req.header('x-request-id') ?? randomUUID();
  const span      = trace.getActiveSpan();
  const traceId   = span?.spanContext().traceId;

  const reqLogger = rootLogger.child({
    request_id: requestId,
    method:     ctx.req.method,
    path:       ctx.req.path,
    ...(traceId ? { trace_id: traceId } : {}),
  });

  ctx.set('requestId', requestId);
  ctx.set('logger',    reqLogger);
  ctx.header('x-request-id', requestId);

  let errorThrown: unknown;
  try {
    await next();
  } catch (err) {
    errorThrown = err;
    throw err;
  } finally {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    // Hono's matched route pattern — low cardinality. Falls back to path
    // if the request never matched (404), which is bounded by attackers
    // probing — accept the risk or hash unknowns if it grows.
    const route = ctx.req.routePath ?? ctx.req.path;
    const status = String(ctx.res.status);

    httpRequestsTotal.inc({ method: ctx.req.method, route, status_code: status });
    httpRequestDurationSeconds.observe({ method: ctx.req.method, route, status_code: status }, durationSec);

    ctx.header('Server-Timing', `app;dur=${(durationSec * 1000).toFixed(1)}`);

    // SLA threshold: a slow 2xx is invisible if we only level by status.
    // Escalate anything slower than ADMIN_API_SLA_SECONDS to warn so slow
    // paths surface in log-based alerts, not just the latency histogram.
    const slaSec = Number(process.env['ADMIN_API_SLA_SECONDS'] ?? 2);
    const slaExceeded = durationSec > slaSec;

    let logFn = reqLogger.info.bind(reqLogger);
    if (errorThrown || ctx.res.status >= 500) logFn = reqLogger.error.bind(reqLogger);
    else if (ctx.res.status >= 400 || slaExceeded) logFn = reqLogger.warn.bind(reqLogger);

    // Coerce non-Error throws (string/object rejections) so failure detail
    // is never dropped from the log line. Objects go through JSON to avoid
    // the '[object Object]' default stringification.
    let errField: Record<string, unknown> = {};
    if (errorThrown instanceof Error) {
      errField = { err: errorThrown };
    } else if (errorThrown !== undefined) {
      errField = {
        err: typeof errorThrown === 'object' ? JSON.stringify(errorThrown) : String(errorThrown),
      };
    }

    logFn({
      status:      ctx.res.status,
      duration_ms: Math.round(durationSec * 1000),
      route,
      ...errField,
      ...(slaExceeded ? { sla_exceeded: true } : {}),
    }, 'request');
  }
};
