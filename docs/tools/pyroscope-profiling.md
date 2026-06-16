---
title: Pyroscope continuous profiling (@pyroscope/nodejs)
type: tool
tags: [pyroscope, profiling, observability, performance, nodejs]
sources:
  - admin-api/src/lib/observability/telemetry.ts
  - src/lib/observability/telemetry.ts
  - admin-api/src/lib/k8s-job-builder.ts
  - package.json
  - admin-api/package.json
created: 2026-06-16
updated: 2026-06-16
---

## What it does

`@pyroscope/nodejs` is the continuous-profiling agent for Tucaken's three
long-lived Node runtimes: the `admin-api` BFF, the SSR Node process, and the
dispatched Kubernetes Job pods that run the Bedrock pipelines. It periodically
samples CPU and heap allocation as pprof data and pushes it to a Pyroscope
server, where Grafana renders flame graphs. Both telemetry bootstraps describe
the captured signals as "CPU + heap pprof samples"
([admin-api/src/lib/observability/telemetry.ts:69](../../admin-api/src/lib/observability/telemetry.ts);
[src/lib/observability/telemetry.ts:57](../../src/lib/observability/telemetry.ts)).
The SSR side states the explicit goal: "flame graphs surface what renders consume
CPU per route"
([src/lib/observability/telemetry.ts:57-58](../../src/lib/observability/telemetry.ts)).

Both processes pin the same version, `@pyroscope/nodejs@^0.4.5`
([package.json:38](../../package.json);
[admin-api/package.json:32](../../admin-api/package.json)).

## How it is configured

Profiling is initialised inside the OpenTelemetry bootstrap of each runtime,
after `sdk.start()`. The agent is loaded with a dynamic `import()` and gated on
the `PYROSCOPE_SERVER_ADDRESS` env var, so the native bindings are only pulled in
when an address is present. The admin-api block:

```ts
if (process.env['PYROSCOPE_SERVER_ADDRESS']) {
  const { default: Pyroscope } = await import('@pyroscope/nodejs');
  Pyroscope.init({
    serverAddress: process.env['PYROSCOPE_SERVER_ADDRESS'],
    appName:       process.env['OTEL_SERVICE_NAME'] ?? 'admin-api',
    tags: {
      env:       process.env['DEPLOY_ENV']           ?? 'dev',
      version:   process.env['OTEL_SERVICE_VERSION'] ?? '0.0.0',
      namespace: process.env['POD_NAMESPACE']        ?? 'admin-api',
    },
  });
  Pyroscope.start();
}
```

([admin-api/src/lib/observability/telemetry.ts:71-83](../../admin-api/src/lib/observability/telemetry.ts))

Key configuration points, grounded in the two bootstraps:

- **`serverAddress`** — read straight from `PYROSCOPE_SERVER_ADDRESS`. There is
  no hard-coded default in the source; an unset value disables profiling entirely
  (see Failure modes).
- **`appName`** — falls back through `OTEL_SERVICE_NAME`, defaulting to
  `admin-api` for the BFF and `tucaken-app` for the SSR process
  ([admin-api/src/lib/observability/telemetry.ts:75](../../admin-api/src/lib/observability/telemetry.ts);
  [src/lib/observability/telemetry.ts:64](../../src/lib/observability/telemetry.ts)).
  This is the series name flame graphs are grouped under, and it deliberately
  reuses the same service identity as the trace `service.name`.
- **`tags`** — three label dimensions on every profile: `env` (from `DEPLOY_ENV`,
  default `dev`), `version` (from `OTEL_SERVICE_VERSION`, default `0.0.0`), and
  `namespace` (from `POD_NAMESPACE`, default `admin-api` / `tucaken-app`)
  ([admin-api/src/lib/observability/telemetry.ts:76-80](../../admin-api/src/lib/observability/telemetry.ts);
  [src/lib/observability/telemetry.ts:65-69](../../src/lib/observability/telemetry.ts)).
  The `version` tag is what lets a CPU regression be attributed to a specific
  deploy.

The push cadence is documented in the admin-api comment as every 10s
([admin-api/src/lib/observability/telemetry.ts:69](../../admin-api/src/lib/observability/telemetry.ts));
the `init` call does not override the agent's default interval, so the 10s figure
is the agent default rather than a configured value.

### Build packaging

The SSR bundle keeps `@pyroscope/*` external from the esbuild step that produces
`telemetry.js`, alongside `@opentelemetry/*` — the agent is resolved from
`node_modules` at runtime, never inlined into the bundle
([package.json:16](../../package.json)). Both runtimes load the telemetry module
via `node --import` so the profiler is installed before the application's own
modules are imported (admin-api `start` script:
[admin-api/package.json:9](../../admin-api/package.json)).

## How it integrates with the rest of the system

The long-lived processes (admin-api, SSR) get `PYROSCOPE_SERVER_ADDRESS` from the
Helm chart environment. The dispatched Kubernetes Job pods get it from a single
shared helper, `observabilityEnv`, in the job builder:

```ts
{ name: 'PYROSCOPE_SERVER_ADDRESS', value: 'http://pyroscope.monitoring.svc.cluster.local:4040' },
```

([admin-api/src/lib/k8s-job-builder.ts:97](../../admin-api/src/lib/k8s-job-builder.ts))

`observabilityEnv` is the single source of truth that every dispatch route
(ingestion, article-pipeline, job-strategist, resume-import) merges into its Job
spec, so all pipeline pods carry identical OTel + Pyroscope + Pushgateway wiring
without per-route copy-paste drift
([admin-api/src/lib/k8s-job-builder.ts:81-102](../../admin-api/src/lib/k8s-job-builder.ts)).
Because the in-cluster address is always injected, a Job pod that runs the same
telemetry bootstrap will always enable Pyroscope — the gate is only "off" outside
the cluster.

Profiling sits alongside the OTel trace pipeline rather than inside it: the same
`OTEL_SERVICE_NAME` is reused as `appName`, and the same env-injection path
(`observabilityEnv`) that supplies `OTEL_EXPORTER_OTLP_ENDPOINT` supplies
`PYROSCOPE_SERVER_ADDRESS`, so a service's traces and profiles share one identity.

## Failure modes

- **Profiling silently off in local dev.** `PYROSCOPE_SERVER_ADDRESS` unset means
  the entire `if` block is skipped, the agent module is never imported, and no
  native bindings are loaded. This is intentional — the SSR comment notes the skip
  exists "so local dev doesn't pull native bindings"
  ([src/lib/observability/telemetry.ts:59](../../src/lib/observability/telemetry.ts)).
  Profiles simply will not appear; nothing errors.
- **Native binding / platform mismatch.** `@pyroscope/nodejs` ships native
  addons. Because the import is dynamic and gated, a missing or
  architecture-mismatched binary cannot break local dev or tests where the env var
  is absent — but in-cluster, a binary that fails to load would surface at the
  `await import('@pyroscope/nodejs')` call. There is no `try`/`catch` around the
  init block, so an import failure would propagate.
- **Wrong / unreachable server address.** A non-existent `PYROSCOPE_SERVER_ADDRESS`
  enables the agent but profiles never land. The pushed data is fire-and-forget;
  there is no readiness gate tied to a successful push.
- **Lost final samples on shutdown.** The graceful-shutdown handler awaits
  `sdk.shutdown()` for OTel spans but does not call `Pyroscope.stop()`
  ([admin-api/src/lib/observability/telemetry.ts:86-94](../../admin-api/src/lib/observability/telemetry.ts)),
  so the last in-flight profile window can be dropped on SIGTERM. For short-lived
  Job pods this means the very tail of a run may not be profiled.

## Operational notes

- **Overhead.** The admin-api comment records the runtime cost as "~1-2%
  overhead" for pushing CPU + heap samples
  ([admin-api/src/lib/observability/telemetry.ts:69-70](../../admin-api/src/lib/observability/telemetry.ts)).
  This is the accepted trade for always-on profiling across every runtime.
- **Attributing a regression to a deploy.** Filter flame graphs by the `version`
  tag (sourced from `OTEL_SERVICE_VERSION` / chart appVersion) to compare CPU
  shape before and after a release; combine with the `env` and `namespace` tags to
  isolate a single service in a single environment.
- **Profiling a pipeline run.** Job pods are profiled the same way as the
  long-lived services because they inherit the in-cluster
  `PYROSCOPE_SERVER_ADDRESS`. The pod's `OTEL_SERVICE_NAME` (set per dispatch route
  via `observabilityEnv(serviceName, …)`) becomes the `appName`, so each pipeline
  type shows up as its own profile series.
- **Enabling locally.** Export a reachable `PYROSCOPE_SERVER_ADDRESS` (e.g. a
  port-forward to the in-cluster `pyroscope.monitoring.svc.cluster.local:4040`)
  before starting the process; the gate will then load the agent. Expect the
  native bindings to be resolved at that point.
- **Version pin.** Keep the admin-api and root `@pyroscope/nodejs` versions in
  lockstep at `^0.4.5` — both telemetry bootstraps assume the same agent API
  surface ([package.json:38](../../package.json);
  [admin-api/package.json:32](../../admin-api/package.json)).

## Deeper detail

For where profiling sits within the wider signal stack — traces (Tempo), metrics
(Prometheus / Mimir), logs (Loki / Pino) and the Alloy collector pipeline that
correlates them — see
[Four-pillar observability](../concepts/four-pillars-observability.md). This doc
focuses on the profiling configuration and operational detail beyond that
overview.

<!--
Evidence trail — verified 2026-06-16
- admin-api/src/lib/observability/telemetry.ts:68-94 — Pyroscope.init block: serverAddress, appName (OTEL_SERVICE_NAME ?? 'admin-api'), tags {env,version,namespace}, ~1-2% overhead + every-10s comment, dynamic import gated on PYROSCOPE_SERVER_ADDRESS, shutdown handler does not stop Pyroscope.
- src/lib/observability/telemetry.ts:56-72 — SSR bootstrap: same init shape, appName 'tucaken-app', "flame graphs surface what renders consume CPU per route", "so local dev doesn't pull native bindings".
- admin-api/src/lib/k8s-job-builder.ts:81-102 — observabilityEnv injects PYROSCOPE_SERVER_ADDRESS=http://pyroscope.monitoring.svc.cluster.local:4040 into every Job pod; single-source-of-truth comment.
- package.json:16 — esbuild keeps @pyroscope/* external for telemetry.js; :38 — @pyroscope/nodejs ^0.4.5.
- admin-api/package.json:9 — node --import telemetry start script; :32 — @pyroscope/nodejs ^0.4.5.
- docs/concepts/four-pillars-observability.md — high-level coverage (lines 86-96, 119); this doc deliberately does not duplicate it.
-->
