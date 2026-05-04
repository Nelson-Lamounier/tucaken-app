/**
 * @format
 * tucaken-app — OpenTelemetry SDK bootstrap for the SSR Node process.
 *
 * Loaded via `node --import ./telemetry.js server.js` so the SDK monkey-
 * patches Node's http + undici (the engine behind global fetch) before the
 * SSR bundle imports them.
 *
 * Frontend RUM (Faro) traces stop at the browser. This module adds the
 * server-side leg: SSR-incoming http span ─► outgoing fetch to admin-api
 * carrying W3C `traceparent`. admin-api continues the trace, so Tempo
 * shows browser → SSR → admin-api → pg as one waterfall.
 *
 * Env vars (Helm-templated):
 *   OTEL_SERVICE_NAME            (default 'tucaken-app')
 *   OTEL_SERVICE_VERSION         (chart appVersion)
 *   OTEL_EXPORTER_OTLP_ENDPOINT  (e.g. http://alloy.observability:4318)
 *   OTEL_RESOURCE_ATTRIBUTES     (deployment.environment=dev,…)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]:    process.env['OTEL_SERVICE_NAME']    ?? 'tucaken-app',
    [ATTR_SERVICE_VERSION]: process.env['OTEL_SERVICE_VERSION'] ?? '0.0.0',
  }),
  traceExporter: new OTLPTraceExporter({}),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-fs':  { enabled: false },
      '@opentelemetry/instrumentation-http': {
        // Probe + asset traffic dominate SSR; drop them.
        ignoreIncomingRequestHook: (req) => {
          const url = req.url ?? '';
          return url === '/livez' || url === '/readyz' || url === '/metrics'
              || url.startsWith('/assets/') || url.startsWith('/favicon');
        },
      },
      // undici instrumentation traces global fetch — admin-api calls included.
      '@opentelemetry/instrumentation-undici': { enabled: true },
    }),
  ],
});

sdk.start();

// ── Pyroscope continuous profiling ───────────────────────────────────────────
// Profiles the SSR Node process (CPU + heap) so flame graphs surface what
// renders consume CPU per route. Skipped when PYROSCOPE_SERVER_ADDRESS is
// unset so local dev doesn't pull native bindings.
if (process.env['PYROSCOPE_SERVER_ADDRESS']) {
  const { default: Pyroscope } = await import('@pyroscope/nodejs');
  Pyroscope.init({
    serverAddress: process.env['PYROSCOPE_SERVER_ADDRESS'],
    appName:       process.env['OTEL_SERVICE_NAME'] ?? 'tucaken-app',
    tags: {
      env:       process.env['DEPLOY_ENV']         ?? 'dev',
      version:   process.env['OTEL_SERVICE_VERSION'] ?? '0.0.0',
      namespace: process.env['POD_NAMESPACE']      ?? 'tucaken-app',
    },
  });
  Pyroscope.start();
}

const shutdown = async (): Promise<void> => {
  try {
    await sdk.shutdown();
  } catch (err) {
    console.error('[tucaken-app] OTel shutdown error', err);
  }
};
process.once('SIGTERM', shutdown);
process.once('SIGINT',  shutdown);
