/**
 * @format
 * tucaken-app — Prometheus metrics for the SSR Node process.
 *
 * Browser metrics ship via Faro RUM. This file covers the server runtime:
 *   - default Node metrics (process, eventloop, GC, heap)
 *   - SSR HTTP RED histogram + counter
 *   - admin-api outbound call RED (to spot 5xx storms from upstream)
 */

import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({
  service: process.env['OTEL_SERVICE_NAME'] ?? 'tucaken-app',
  env:     process.env['DEPLOY_ENV']         ?? 'dev',
});

collectDefaultMetrics({ register: registry, eventLoopMonitoringPrecision: 10 });

export const ssrRequestsTotal = new Counter({
  name:       'ssr_requests_total',
  help:       'Total HTTP requests handled by the SSR Node process.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers:  [registry],
});

export const ssrRequestDurationSeconds = new Histogram({
  name:       'ssr_request_duration_seconds',
  help:       'SSR HTTP request handler latency in seconds.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers:  [registry],
});

export const adminApiRequestsTotal = new Counter({
  name:       'admin_api_client_requests_total',
  help:       'Outbound HTTP requests from tucaken-app SSR to admin-api.',
  labelNames: ['method', 'path', 'status_code'] as const,
  registers:  [registry],
});

export const adminApiRequestDurationSeconds = new Histogram({
  name:       'admin_api_client_request_duration_seconds',
  help:       'Outbound admin-api call latency in seconds.',
  labelNames: ['method', 'path', 'status_code'] as const,
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers:  [registry],
});
