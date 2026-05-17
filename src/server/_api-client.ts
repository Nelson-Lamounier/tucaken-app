/**
 * @format
 * Shared admin-api HTTP client used by every `src/server/*.ts` server function.
 *
 * Replaces the per-file `apiFetch` duplication. Adds:
 *   - W3C `traceparent` / `tracestate` injection from the active OTel span,
 *     so admin-api continues the same trace (Tempo end-to-end waterfall).
 *   - `x-request-id` propagation (or fresh UUID if absent), echoed back in
 *     logs and visible in Grafana from both ends.
 *   - Outbound RED metrics (rate / errors / duration) per low-cardinality
 *     `path` label (the route template, NOT the full path with IDs).
 *   - Structured JSON log per call with trace_id + duration_ms + status.
 *
 * The `pathTemplate` argument is the metric label (e.g. '/articles/:id').
 * The `path` is the actual URL (e.g. '/articles/abc-123'). Keeping these
 * separate prevents Prometheus series explosion.
 */

import { randomUUID } from 'node:crypto';
import { getCookie, getRequest } from '@tanstack/react-start/server';
import { context, propagation, trace } from '@opentelemetry/api';
import { logger } from '../lib/observability/logger.js';
import {
  adminApiRequestsTotal,
  adminApiRequestDurationSeconds,
} from '../lib/observability/metrics.js';
import { MOCK_AUTH, mockApiResponse } from './_dev-mock';

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002';

function getSessionToken(): string {
  const token = getCookie('__session');
  if (!token) {
    throw new Error('Session cookie missing after auth guard — this should not happen');
  }
  return token;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'headers'> {
  /** Extra headers merged on top of the standard set. */
  headers?: Record<string, string>;
  /**
   * Low-cardinality metric/log label, e.g. '/articles/:slug'. Defaults to
   * the literal path — fine for fixed routes, BAD for parameterised ones.
   * Always pass an explicit template when the URL contains an ID.
   */
  pathTemplate?: string;
  /**
   * URL prefix prepended to `path`. Default `/api/admin` — covers the
   * Cognito-protected BFF surface. Pass '' (empty string) when calling
   * other top-level routes such as `/api/public/email-exists`.
   */
  apiPrefix?: string;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { pathTemplate = path, headers: extraHeaders, apiPrefix = '/api/admin', ...init } = opts;
  const method = (init.method ?? 'GET').toUpperCase();

  // Dev-only: short-circuit to fixtures so /onboarding works without admin-api.
  if (MOCK_AUTH) {
    return mockApiResponse(path, method) as T;
  }

  const token  = getSessionToken();

  // Reuse upstream request id if Faro/CDN forwarded one; otherwise mint a fresh one.
  // getRequest() throws outside a server-function request context (e.g. tests);
  // catch and mint a UUID rather than crashing the call.
  const upstream = (() => {
    try { return getRequest().headers.get('x-request-id') ?? undefined; } catch { return undefined; }
  })();
  const requestId = upstream ?? randomUUID();

  // Start with auth + content-type + request-id; OTel propagator injects
  // traceparent/tracestate next so they override anything the caller set.
  const headers: Record<string, string> = {
    'Content-Type':   'application/json',
    Authorization:    `Bearer ${token}`,
    'x-request-id':   requestId,
    ...(extraHeaders ?? {}),
  };
  propagation.inject(context.active(), headers);

  const span = trace.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  const start = process.hrtime.bigint();

  let status = 0;
  try {
    const res = await fetch(`${ADMIN_API_URL}${apiPrefix}${path}`, { ...init, headers });
    status = res.status;

    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.clone().json()) as { error?: string };
        detail = body.error ? ` — ${body.error}` : '';
      } catch { /* ignore parse failures */ }

      throw new Error(
        `admin-api ${method} ${pathTemplate} failed [${status}]${detail}`,
      );
    }

    return (await res.json()) as T;
  } finally {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    adminApiRequestsTotal.inc({ method, path: pathTemplate, status_code: String(status) });
    adminApiRequestDurationSeconds.observe(
      { method, path: pathTemplate, status_code: String(status) },
      durationSec,
    );
    logger.info({
      method,
      path: pathTemplate,
      status,
      duration_ms: Math.round(durationSec * 1000),
      request_id: requestId,
      ...(traceId ? { trace_id: traceId } : {}),
    }, 'admin-api call');
  }
}
