---
title: Fail-fast on startup config, fail-soft on async-synced config
type: decision
tags: [kubernetes, configuration, external-secrets, resilience, error-handling]
sources:
  - admin-api/src/lib/config.ts
  - admin-api/src/index.ts
  - admin-api/src/routes/ingestion.ts
  - admin-api/src/routes/assets.ts
created: 2026-06-16
updated: 2026-06-16
---

## Status

Accepted — reflected in current `admin-api` config and route code.

## Context

admin-api depends on two classes of configuration with different availability
guarantees. **Static config** — Cognito ids, RDS credentials, K8s namespace and
service-account names — is present in mounted Secrets and the Helm env block by
the time the pod starts. **Dynamic config** syncs asynchronously *after* startup:
the three-plus Job image URIs arrive via an External Secrets Operator (ESO) file
mount that the kubelet refreshes ~60s after the upstream Secret rotates, and the
optional S3 assets bucket name is populated only once a separate Bedrock content
stack deploys
([config.ts](../../admin-api/src/lib/config.ts#L1-L52)). Treating both classes
the same — crash on anything missing — would make the pod CrashLoopBackOff
during the normal window where a Job image simply has not synced yet, even though
the service is otherwise healthy.

## Decision

Match the failure mode to the config class:

- **Required static config → fail fast at startup.** `loadConfig()` collects all
  required env vars and throws if any are missing
  ([config.ts](../../admin-api/src/lib/config.ts#L269-L300)), called at module
  load in [index.ts](../../admin-api/src/index.ts#L55-L60). A genuine
  misconfiguration therefore surfaces as a CrashLoopBackOff visible in ArgoCD,
  not as a runtime error hours later on the first request.
- **Async-synced dynamic config → fail soft at request time.** `getJobImage()`
  resolves via a fallback chain — file mount, then env var (local dev), then an
  `UNSET_IMAGE_SENTINEL` — with a short in-process TTL cache
  ([config.ts](../../admin-api/src/lib/config.ts#L93-L116)). Routes guard with
  `isImageConfigured()` and return **502** when the image is still the sentinel
  ([ingestion.ts](../../admin-api/src/routes/ingestion.ts#L121-L125),
  [applications.ts](../../admin-api/src/routes/applications.ts#L816-L820)).
  Routes that write to S3 guard with `isAssetsBucketConfigured()` and return
  **503** when the bucket is absent
  ([assets.ts](../../admin-api/src/routes/assets.ts#L92-L101)).

## Consequences

The pod stays up and serves every endpoint whose dependencies are ready while a
slow-syncing image or an undeployed Bedrock stack degrades only the affected
routes, with an actionable message ("wait ~60s for ESO/kubelet sync"). A truly
missing required var still crashes loudly at startup, keeping real
misconfiguration impossible to miss. The cost is two failure paths to reason
about and per-route guards that must be remembered for any new Job-dispatching or
S3-writing endpoint; `getJobImage` re-reads the mount (cached for
`JOB_IMAGE_CACHE_TTL_MS`) so a freshly synced image is picked up without an
admin-api Rollout ([config.ts](../../admin-api/src/lib/config.ts#L71-L116)).

## Alternatives considered

- **Crash on any missing config (treat dynamic like static)** — rejected: the pod
  would CrashLoopBackOff during the normal ~60s ESO sync window and whenever the
  optional Bedrock stack is undeployed, turning a healthy service into a red
  ArgoCD app for a non-error condition.
- **Validate dynamic config once at startup** — rejected: the image URIs and
  bucket name can arrive (and rotate) after boot, so a startup snapshot would be
  stale; the per-request resolve with TTL cache reflects the current mount.
- **Dispatch the Job with an unresolved image** — rejected: the Job would fail
  with ImagePullBackOff, burying a clear "not yet configured" condition under a
  Kubernetes pull error and wasting a Job/quota.

## Related

- [API-dispatched Kubernetes Jobs](../concepts/api-dispatched-k8s-jobs.md) — the
  dispatch paths these image guards protect.
- [admin-api — Backend-for-Frontend for tucaken-app](../projects/admin-api.md) —
  startup validation and credential model.

<!--
Evidence trail (auto-generated):
- Source: admin-api/src/lib/config.ts (read on 2026-06-16, lines 1-130, 269-300)
- Source: admin-api/src/index.ts (read on 2026-06-16, lines 55-60)
- Source: admin-api/src/routes/ingestion.ts (read on 2026-06-16, lines 118-135)
- Source: admin-api/src/routes/applications.ts (read on 2026-06-16, lines 815-822)
- Source: admin-api/src/routes/assets.ts (read on 2026-06-16, lines 88-102)
-->
