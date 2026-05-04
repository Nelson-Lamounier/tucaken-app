/**
 * @format
 * tucaken-app — Server-side structured logger (pino).
 *
 * Browser code MUST NOT import this file (pino is Node-only). RUM logs go
 * through Faro (`src/lib/observability/faro-admin.ts`); this module covers
 * server functions, the SSR runtime in `src/server/patches.ts`, and any
 * Node-side code path.
 *
 * Each record carries the active OTel span's `trace_id`/`span_id` when
 * present, closing the Loki ↔ Tempo loop in Grafana.
 */

import { pino, type Logger } from 'pino';
import { context, trace } from '@opentelemetry/api';

const level = process.env['LOG_LEVEL']
  ?? (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug');

export const logger: Logger = pino({
  level,
  base: {
    service: process.env['OTEL_SERVICE_NAME'] ?? 'tucaken-app',
    env:     process.env['DEPLOY_ENV']         ?? 'dev',
  },
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) return {};
    const { traceId, spanId, traceFlags } = span.spanContext();
    return { trace_id: traceId, span_id: spanId, trace_flags: traceFlags };
  },
  formatters: { level: (label: string) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.token',
      '*.idToken',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
});
