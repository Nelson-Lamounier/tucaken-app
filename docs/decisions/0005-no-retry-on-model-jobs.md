---
title: No Job-level retry for model-invoking Kubernetes Jobs
type: decision
tags: [kubernetes, bedrock, finops, batch-jobs, cost-control]
sources:
  - admin-api/src/lib/k8s-job-builder.ts
  - admin-api/src/lib/ingestion-job.ts
created: 2026-06-16
updated: 2026-06-16
---

## Status

Accepted — introduced 2026-06-10 (commits `609c046`, `adda2ac`, PR #95).

## Context

Every Bedrock-driven pipeline runs as a Kubernetes `batch/v1` Job dispatched by
admin-api (see [API-dispatched Kubernetes Jobs](../concepts/api-dispatched-k8s-jobs.md)).
Jobs originally used `backoffLimit: 2`, so a failure retried the whole pipeline
up to three times. Each retry re-ran the ~6-minute Sonnet writer from scratch.
The waste was concrete: a `sectionOrder` failure in run `a11ceea0` re-spent the
writer 5 times for roughly $1.45 of Bedrock cost on a single deterministic
failure (commit `609c046`). LLM-pipeline failures are usually deterministic —
schema or parse errors that fail identically on every retry — while transient
Bedrock throttles are already retried inside the agent's SDK call, not at the Job
level.

## Decision

Set the Job-level retry count to **0** for all model-invoking Jobs, via a single
exported constant `MODEL_JOB_BACKOFF_LIMIT = 0`
([k8s-job-builder.ts](../../admin-api/src/lib/k8s-job-builder.ts#L41-L51)). It is
used as the default `backoffLimit` in `buildPipelineJob`
([k8s-job-builder.ts](../../admin-api/src/lib/k8s-job-builder.ts#L148)) and
directly in `buildIngestionJobSpec`
([ingestion-job.ts](../../admin-api/src/lib/ingestion-job.ts#L71)). No workload
hardcodes its own Job-level `backoffLimit`; `buildPipelineJob` allows an explicit
override via `input.backoffLimit` but defaults to the constant. The first commit
covered only analyse/coach; the follow-up found `backoffLimit: 2` hardcoded in
three more Bedrock-invoking sites (ingestion, resume-import, github resync,
routes/ingestion) and centralised them all on the one constant so no workload can
drift (commit `adda2ac`).

## Consequences

A deterministic pipeline failure now fails once and stops, ending the
re-spend-on-retry cost leak. Transient Bedrock throttles remain handled by
SDK-internal retries, so legitimate transient recovery is unaffected. The cost is
resilience to genuinely transient *non-throttle* failures (e.g. a one-off network
blip outside the SDK retry envelope): such a run fails permanently and must be
re-triggered by the user or an operator rather than self-healing. Because the
policy is one constant imported everywhere, adding a new model Job inherits the
correct retry behaviour for free, and a test asserts `backoffLimit: 0` against the
builder and tech-extract spec so a regression is caught in CI (commit `adda2ac`).

## Alternatives considered

- **Keep `backoffLimit: 2`** — rejected: re-spends Bedrock on failures that are
  overwhelmingly deterministic, the exact cost leak that triggered this decision.
- **Per-workload `backoffLimit`** — rejected: the original state. Three sites had
  silently drifted to `backoffLimit: 2`, proving per-route values do not stay
  consistent. Centralising removes the drift class entirely.
- **Application-level retry inside the worker** — out of scope here; transient
  Bedrock throttles are already retried inside the agent SDK call, which is the
  correct layer for retry-worthy (transient) failures.

<!--
Evidence trail (auto-generated):
- Source: admin-api/src/lib/k8s-job-builder.ts (read on 2026-06-16, lines 41-51,148)
- Source: admin-api/src/lib/ingestion-job.ts (read on 2026-06-16, line 71)
- Commit: 609c046 (2026-06-10) default Job backoffLimit to 0
- Commit: adda2ac (2026-06-10, #95) backoffLimit 0 for ALL model-invoking Jobs
-->
