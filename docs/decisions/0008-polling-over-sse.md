---
title: Client polling over Server-Sent Events for live pipeline progress
type: decision
tags: [real-time, polling, sse, tanstack-query, architecture]
sources:
  - src/features/github/hooks/use-github-connected-repos.ts
  - src/features/ai-agent/hooks/use-pipeline-status.ts
  - src/hooks/use-admin-applications.ts
  - .github/workflows/deploy-admin-api.yml
created: 2026-06-16
updated: 2026-06-16
---

## Status

Accepted. Tucaken surfaces live progress for long-running back-end work
(GitHub repo ingestion, the Bedrock article pipeline, and application
analyse/coach pipelines) through client-driven polling, not a push channel.
As of 2026-06-16 there is no Server-Sent Events (SSE) or Redis Streams code
anywhere in `src` or `admin-api` — the codebase has only ever shipped polling.

## Context

Several user-facing surfaces track work that runs asynchronously on the server
and can take minutes to complete. Each tracks progress by re-reading status on
an interval with TanStack Query's `refetchInterval`, and each stops once the
work reaches a terminal state or a wall-clock timeout is hit:

- [`use-github-connected-repos.ts`](../../src/features/github/hooks/use-github-connected-repos.ts)
  polls every 5s while any repo is `pending`/`syncing`, up to a 15-minute
  timeout (production repo ingestion can take ~15 min), then latches the stuck
  repos to `error`.
- [`use-pipeline-status.ts`](../../src/features/ai-agent/hooks/use-pipeline-status.ts)
  polls the Bedrock article pipeline every 10s while `pending`/`processing`,
  with a 10-minute timeout and a terminal-state set
  (`review`/`published`/`rejected`/`flagged`/`failed`).
- [`use-admin-applications.ts`](../../src/hooks/use-admin-applications.ts)
  polls every 5s while any application is `analysing`/`coaching`, with the same
  10-minute timeout.

The `refetchInterval` callback returns the interval while work is active and
`false` once it is not, so polling is self-cancelling rather than running
forever.

The admin-api back end is deployed as a Kubernetes Rollout reconciled by
ArgoCD: the deploy workflow header states "ArgoCD reconciles the admin-api
Rollout" and the run summary describes the promotion path as
"Image Updater picks up tag -> ArgoCD reconciles -> Argo Rollouts Blue/Green"
(see [`deploy-admin-api.yml`](../../.github/workflows/deploy-admin-api.yml)).
That means the service can run multiple replicas and is replaced pod-by-pod
during a blue/green promotion. Any real-time mechanism has to survive that
without dropping client updates.

## Decision

Use TanStack Query `refetchInterval` polling for all live progress, reading
status from the same server functions/queries the rest of the app already uses.
Do not add SSE, WebSocket, or Redis Streams push infrastructure.

The decisive property is statelessness. A poll is an ordinary stateless request
that any healthy replica can answer, so it is naturally correct under multiple
replicas and during a blue/green rollout: when the back end is replaced, the
next poll simply hits a new pod and continues. No sticky sessions, no
connection draining, and no cross-replica fan-out are needed. Progress is also
reconciled authoritatively server-side (the connected-repos hook notes the
admin-api read-time reconcile and the platform-job-watcher sweep mark stuck
repos errored regardless of the client), so the client poll is a view, not the
source of truth.

## Consequences

- New live-progress surfaces follow the same pattern: a TanStack Query with a
  `refetchInterval` that returns the interval while active and `false` at a
  terminal state, plus a wall-clock timeout. Reuse the existing hooks rather
  than introducing a parallel transport.
- Updates lag by up to one poll interval (5-10s). This is acceptable for
  minutes-long jobs and is the explicit trade for operational simplicity.
- There is steady background request volume while jobs are active, bounded by
  the self-cancelling interval and the timeout latch. There is no idle
  long-lived connection per client to hold open across replicas.
- The decision is deferred, not foreclosed: if a future surface genuinely needs
  sub-second push UX, SSE/Streams can be revisited for that surface without
  unwinding the polling already in place.

## Alternatives considered

- **Server-Sent Events (EventSource).** Rejected for now. SSE holds a
  long-lived stateful connection per client, which complicates a multi-replica,
  blue/green-deployed back end: connections must be drained on pod replacement
  and clients re-established against a new replica. The simplicity tax is not
  justified while updates measured in seconds are acceptable. No `EventSource`
  or `text/event-stream` usage exists in `src` or `admin-api` as of 2026-06-16.
- **Redis Streams (XADD/XREAD) as a fan-out bus.** Rejected for now. It would
  add a stateful coordination layer (and a consumer per replica) purely to push
  progress that polling already reports correctly, with no current product
  requirement that polling fails to meet. No `XADD`/`XREAD` usage exists in
  `src` or `admin-api` as of 2026-06-16.
- **WebSockets.** Not pursued; same stateful-connection and replica-affinity
  concerns as SSE, with more protocol overhead than the read-only,
  server-to-client progress flow requires.

<!--
Evidence trail (auto-generated):
- Source: src/features/github/hooks/use-github-connected-repos.ts (read 2026-06-16; POLL_INTERVAL 5000, POLL_TIMEOUT_MS 15min, refetchInterval lines 24-41)
- Source: src/features/ai-agent/hooks/use-pipeline-status.ts (read 2026-06-16; POLL_INTERVAL_MS 10000, POLL_TIMEOUT_MS 10min, TERMINAL_STATES lines 49-55, refetchInterval lines 81-100)
- Source: src/hooks/use-admin-applications.ts (read 2026-06-16; PIPELINE_POLL_INTERVAL 5000, ACTIVE_PIPELINE_STATUSES analysing/coaching, refetchInterval lines 28-40)
- Source: .github/workflows/deploy-admin-api.yml (read 2026-06-16; "admin-api Rollout" line 7, "Argo Rollouts Blue/Green" line 193)
- Negative grep (confirms SSE/Streams ABSENT): `git grep -nE "EventSource|text/event-stream|XADD|XREAD|xadd|xread" src admin-api` returned no matches (exit 1) on 2026-06-16
-->
