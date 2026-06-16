---
title: Grafana Faro — real user monitoring (RUM)
type: tool
tags: [grafana-faro, rum, observability, distributed-tracing, web-vitals, tempo]
sources:
  - src/lib/observability/faro-admin.ts
  - src/app/__root.tsx
  - .github/workflows/deploy.yml
created: 2026-06-16
updated: 2026-06-16
---

## What it does

Grafana Faro is the browser-side arm of the observability stack: it captures real
user monitoring (RUM) from the running web app — Web Vitals, JavaScript errors,
console output, and session/view tracking — and emits client-side traces that
continue into the server. It is the one telemetry source that originates in the
user's browser rather than a Node process, and its defining contribution is
stitching the browser into the same distributed trace as the SSR app and
`admin-api`, so a single Tempo waterfall spans browser → SSR → admin-api → pg.

## How it is configured

Faro is initialised by `initialiseFaroAdmin()`
([faro-admin.ts](../../src/lib/observability/faro-admin.ts#L30-L91)), which calls
`initializeFaro` from `@grafana/faro-web-sdk` directly. The app is identified as
`portfolio-admin` with version from `VITE_APP_VERSION` and environment from Vite's
`MODE` ([faro-admin.ts](../../src/lib/observability/faro-admin.ts#L51-L57)).
Configuration comes entirely from build-time `VITE_FARO_*` variables (Vite
`import.meta.env`), not Next.js-style `NEXT_PUBLIC_*`:

- `VITE_FARO_ENABLED` — when `'false'`, init returns `null`
  ([faro-admin.ts](../../src/lib/observability/faro-admin.ts#L35-L38)).
- `VITE_FARO_URL` — the collector endpoint; absent → init returns `null`
  ([faro-admin.ts](../../src/lib/observability/faro-admin.ts#L46-L49)).

Because these are `VITE_`-prefixed, they are inlined at build time. The deploy
workflow resolves the client `VITE_` build args from SSM before the Docker build
([.github/workflows/deploy.yml](../../.github/workflows/deploy.yml#L82)), so the
collector URL is baked into the bundle from SSM parameters, not read at runtime.

## How it integrates with the rest of the system

`initialiseFaroAdmin()` is called once from the root route
([__root.tsx](../../src/app/__root.tsx#L124)); a module-level singleton guards
against React strict-mode double-initialisation
([faro-admin.ts](../../src/lib/observability/faro-admin.ts#L19-L33)). Two
instrumentation groups are registered: `getWebInstrumentations` (Web Vitals, JS
error capture, console interception, session and view tracking) and
`TracingInstrumentation`, which propagates the W3C `traceparent`/`tracestate`
headers to the SSR and admin-api origins via `propagateTraceHeaderCorsUrls`
(matching `*.nelsonlamounier.com`, `tucaken.io|com`, and localhost)
([faro-admin.ts](../../src/lib/observability/faro-admin.ts#L59-L80)). Client traces
are forwarded to Tempo via the Alloy OTLP collector, the same backend the Node
runtimes export to — see [four-pillar observability](../concepts/four-pillars-observability.md).

## Failure modes

Initialisation is best-effort and never breaks the app: it returns `null` (RUM
simply absent) on any of — explicit disable (`VITE_FARO_ENABLED='false'`),
server-side rendering (no `window`), a missing `VITE_FARO_URL`, or any thrown
error caught by the surrounding `try/catch`
([faro-admin.ts](../../src/lib/observability/faro-admin.ts#L35-L90)). The most
common "RUM not appearing" cause is therefore a build that lacked `VITE_FARO_URL`,
not a runtime fault.

## Operational notes

RUM stays inert until the `VITE_FARO_*` parameters exist in SSM at build time —
with no `VITE_FARO_URL` resolved, `initialiseFaroAdmin()` returns `null` and the
bundle ships without a collector. Enabling RUM is therefore a build-time concern:
populate the SSM `VITE_FARO_*` parameters that the deploy workflow reads
([deploy.yml](../../.github/workflows/deploy.yml#L82)), then rebuild so the
collector URL is inlined. The unit test
[`src/__tests__/lib/observability/faro-admin.test.ts`](../../src/__tests__/lib/observability/faro-admin.test.ts)
covers the wiring and guard branches.

## Deeper detail

- [Four-pillar observability](../concepts/four-pillars-observability.md) — where
  Faro RUM sits relative to OTel traces, Prometheus metrics, Loki logs, and
  Pyroscope profiles.
- [Distributed tracing from API request to worker pod](../concepts/distributed-tracing-api-to-worker.md)
  — the server-side continuation of the trace Faro starts in the browser.

<!--
Evidence trail (auto-generated):
- Source: src/lib/observability/faro-admin.ts (read on 2026-06-16, full file 1-91)
- Source: src/app/__root.tsx (grep on 2026-06-16, lines 14,124 — call site)
- Source: .github/workflows/deploy.yml (line 82 — VITE build-arg SSM resolution)
- Note: faro-admin.ts header @see packages/shared/... is stale — no packages/ dir
  in this repo; the file calls initializeFaro from the SDK directly.
-->
