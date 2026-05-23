/**
 * Integration smoke — Grafana Faro RUM collector.
 *
 * Exercises the real ingestion boundary the browser Faro SDK uses:
 *
 *   Browser (Faro SDK)
 *     -> ALB  /faro                     (shared public ALB, path-routed)
 *     -> faro-proxy (nginx :8080)       (strips /faro)
 *     -> Alloy faro.receiver :12347     (accepts POST at /collect)
 *     -> Loki (logs) + Tempo (spans)
 *
 * This guards the exact regressions we have already hit in this pipeline:
 *   - NetworkPolicy missing port 8080  -> ALB Target.Timeout -> 504
 *   - wrong collector path (/faro)      -> nginx 301 -> 404 (events dropped)
 *   - receiver only ingests at /collect -> a healthy POST returns 202 Accepted
 *
 * Prerequisites:
 *   - Network reachability to the collector (run from a machine that can hit
 *     the public ALB, or inside the cluster).
 *   - Default target is the canonical collector; override per environment with
 *       FARO_COLLECTOR_URL=https://<host>/faro/collect
 *
 * This is a LIVE smoke test — opt-in via `test:integration`, not part of the
 * default unit run. It intentionally fails loudly if the pipeline is down.
 *
 * Mirrors the production wiring in:
 *   - tucaken-app  src/lib/observability/faro-admin.ts (VITE_FARO_URL=/faro/collect)
 *   - frontend     apps/site/src/lib/observability/faro.ts (default .../faro/collect)
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';

// ─── Config ──────────────────────────────────────────────────────────────────

const COLLECTOR_URL =
  process.env['FARO_COLLECTOR_URL'] ?? 'https://ops.nelsonlamounier.com/faro/collect';

// The app origin a real browser request carries. The deployed app posts
// same-origin (tucaken.io/faro/collect) so CORS is not exercised, but we send a
// representative Origin header anyway.
const APP_ORIGIN = process.env['FARO_APP_ORIGIN'] ?? 'https://tucaken.io';

const REQUEST_TIMEOUT_MS = 12_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal but representative Faro SDK payload (web-sdk v2 shape). */
function buildFaroPayload() {
  return {
    meta: {
      app: { name: 'faro-smoke-test', version: 'integration', environment: 'test' },
      sdk: { name: '@grafana/faro-web-sdk', version: 'smoke' },
      session: { id: `smoke-${randomUUID()}` },
      page: { url: `${APP_ORIGIN}/onboarding` },
    },
    logs: [],
    exceptions: [],
    events: [],
    measurements: [
      {
        type: 'web-vitals',
        values: { largest_contentful_paint: 1234 },
        timestamp: new Date().toISOString(),
      },
    ],
    traces: {},
  };
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    redirect: 'manual', // do NOT follow 3xx — a redirect here IS a failure
    headers: {
      'content-type': 'application/json',
      origin: APP_ORIGIN,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Faro RUM collector — integration smoke', () => {
  it(`accepts a Faro payload at ${COLLECTOR_URL} (202)`, async () => {
    const res = await postJson(COLLECTOR_URL, buildFaroPayload());

    // The single most important assertion: the receiver ingested the batch.
    // 202 Accepted is what Alloy's faro.receiver returns on success.
    expect(res.status, `expected 202 from ${COLLECTOR_URL}, got ${res.status}`).toBe(202);
  });

  it('does not redirect or 5xx (regression guard: 504 / 301)', async () => {
    const res = await postJson(COLLECTOR_URL, buildFaroPayload());

    // 504 = ALB had no healthy target (NetworkPolicy missing :8080).
    // 3xx = wrong path / trailing-slash redirect that the SDK never follows.
    expect(res.status, 'collector must not gateway-timeout (504)').not.toBe(504);
    expect(
      res.status >= 300 && res.status < 400,
      `collector must not redirect (got ${res.status})`,
    ).toBe(false);
  });

  it('requires the /collect ingest path — base /faro is not an ingest endpoint', async () => {
    // Guards the bug where VITE_FARO_URL was set to "/faro" (no /collect):
    // the SDK's POST 301-redirected and events were silently dropped.
    expect(COLLECTOR_URL.endsWith('/collect')).toBe(true);

    const basePath = COLLECTOR_URL.replace(/\/collect$/, '');
    const res = await postJson(basePath, buildFaroPayload());

    expect(
      res.status,
      `POST to ${basePath} (no /collect) must NOT ingest, but returned ${res.status}`,
    ).not.toBe(202);
  });
});
