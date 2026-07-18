# tucaken-app documentation

Knowledge base for tucaken-app (the web app + `admin-api` BFF). Each entry is one
self-contained doc. Start with the [admin-api project overview](projects/admin-api.md)
or the root [README](../README.md) for the product and architecture.

## Projects

- [admin-api — Backend-for-Frontend](projects/admin-api.md) — the Hono BFF: auth,
  Postgres, and Kubernetes Job dispatch. Hub for the backend docs below.

## Concepts

- [Networking architecture — tucaken-app and admin-api](concepts/networking-architecture.md) — pod-to-pod BFF calls over service DNS, trust tiers, CORS/CSP, and every egress path.
- [Request lifecycle — browser to pod](concepts/request-lifecycle-browser-to-pod.md) — the edge path: ExternalDNS, shared ALB, WAFv2 exemptions, ACM SNI, IP-mode target groups, blue-green services.
- [API-dispatched Kubernetes Jobs](concepts/api-dispatched-k8s-jobs.md) — routes build a Job spec and submit it; workers run the Bedrock pipelines.
- [Distributed tracing from API request to worker pod](concepts/distributed-tracing-api-to-worker.md) — `TRACEPARENT` propagation across the async boundary.
- [Four-pillar observability](concepts/four-pillars-observability.md) — OTel, Prometheus, Loki, Pyroscope, plus browser RUM.
- [Bedrock cost observability — estimated vs billed](concepts/bedrock-cost-observability.md) — CloudWatch + Cost Explorer and per-invocation cost.
- [Cognito JWT verification — user and service (M2M) tokens](concepts/cognito-jwks-verification.md) — JWKS verification and scope enforcement.
- [SSR query hydration](concepts/ssr-query-hydration.md) — `createServerFn` + `queryOptions` + shared `QueryClient`.
- [Application stage workspaces](concepts/application-stage-workspaces.md) — per-stage interview-prep surfaces and stage state.
- [Evidence-quality and source-lane provenance](concepts/evidence-quality-provenance.md) — what the Applications UI presents (scoring is in ai-applications).
- [Usage quota enforcement](concepts/usage-quota-enforcement.md) — atomic, race-free monthly quotas (`usage_quotas`) with `429` + Retry-After.
- [User provisioning](concepts/user-provisioning.md) — lazy first-request upsert of `users`/`user_identities`, provider detection, 14-day trial.

## Patterns

- [Hono API composition](patterns/hono-api-composition.md) — router factories as DI, typed context, middleware tiers as the security model, uniform validation + error boundaries.
- [Repository layer with database-enforced row-level security](patterns/repository-layer-rls.md) — `withUser` + Postgres RLS.
- [Single shared Job spec for multi-path dispatch](patterns/shared-ingestion-job-spec.md) — one `buildIngestionJobSpec` for both triggers.
- [Redis cache invalidation](patterns/redis-cache.md) — fail-open project-cache invalidator.
- [Validate every server boundary](patterns/server-boundary-validation.md) — Zod in server fns; mixed Zod/manual guards in admin-api.

## Decisions (ADRs)

- [0001 — KB dashboard dual-mode](decisions/0001-kb-dashboard-dual-mode.md)
- [0002 — Absorb coach prep into stage workspaces](decisions/0002-absorb-coach-prep-into-stage-workspaces.md)
- [0003 — V1 stage state in localStorage (typed superset)](decisions/0003-v1-stage-state-in-localstorage-typed-superset.md)
- [0004 — Parse coaching notes into sections client-side](decisions/0004-parse-coaching-notes-into-sections-client-side.md)
- [0005 — No Job-level retry for model-invoking Jobs](decisions/0005-no-retry-on-model-jobs.md)
- [0006 — Fail-fast on startup config, fail-soft on async-synced config](decisions/0006-fail-soft-on-async-synced-config.md)
- [0007 — Accept Cognito's reset-code TTL](decisions/0007-accept-cognito-reset-code-ttl.md)
- [0008 — Polling over SSE](decisions/0008-polling-over-sse.md)
- [0009 — Run the strategist matcher on Sonnet](decisions/0009-sonnet-strategist-matcher.md)
- [0010 — Stamp the dispatched Job image onto pipeline runs](decisions/0010-pipeline-image-sha-stamping.md)
- [0011 — Keep apiFetch over Hono RPC](decisions/0011-no-hono-rpc-keep-apifetch.md)

## Tools

- [Grafana Faro — real user monitoring](tools/grafana-faro-rum.md) — browser RUM and trace propagation.
- [Pyroscope continuous profiling](tools/pyroscope-profiling.md) — CPU/heap profiling.
- [Stripe webhooks](tools/stripe-webhooks.md) — signed webhook to subscription-state sync.

## Runbooks

- [Local development bring-up](runbooks/local-development.md)
- [Cognito User Pool provisioning and updates](runbooks/cognito-setup.md)
- [Pre-deployment checklist](runbooks/pre-deploy-checklist.md)

## Troubleshooting

- [CORS error in production](troubleshooting/cors-error-in-production.md) — why a browser-side CORS failure means a misrouted call, not a config problem.
- [Duplicate ingestion Jobs for the same repo](troubleshooting/duplicate-ingestion-jobs.md)
- [Pipeline run shown as failed when it stalled or succeeded](troubleshooting/pipeline-stall-timeout.md)
- [ATS check missing when ats_check_json is null](troubleshooting/ats-check-metadata-fallback.md)
- [FinOps /costs returns zero despite real Bedrock spend](troubleshooting/finops-costs-empty-untagged-bedrock.md)
- [Onboarding ingestion diagnostics (historical case study)](troubleshooting/onboarding-ingestion-diagnostics.md)

## Reports

- [portfolio-admin observability & reliability review](reports/portfolio-admin-observability-review.md)
  — live review of the tucaken UI RUM + admin-api metrics/errors; the `/readyz`↔`getMeFn` reliability chain, gaps, and the UI/API decoupling assessment (keep the monorepo)

## Architecture and other

- [Repository structure](architecture/repo-structure.md)
- [Architecture review (2026-05-04, superseded snapshot)](architecture/review-2026-05-04.md)
- [Stripe billing integration](billing-integration.md)
