---
title: Keep the hand-rolled apiFetch client over Hono RPC
type: decision
tags: [hono, rpc, bff, typescript, api-client, architecture]
sources:
  - src/server/_api-client.ts
  - admin-api/src/index.ts
  - admin-api/src/routes/github/github.ts
created: 2026-07-18
updated: 2026-07-18
---

## Status

Accepted. tucaken-app's server functions call admin-api through the
hand-maintained [`apiFetch`](../../src/server/_api-client.ts) client (path
strings + explicit response generics), not through Hono RPC
(`hono/client` + `hc<AppType>`). Revisit if the BFF surface starts churning
fast enough that drifting response types become a recurring bug source.

## Context

Hono offers end-to-end type inference across an HTTP boundary: routes
defined with chained method calls export an `AppType`, and `hc<AppType>()`
gives the caller compile-checked paths, params and response types. admin-api
currently exposes ~27 route modules consumed by tucaken-app server functions
through `apiFetch<T>(path, opts)`, where `T` and the path template are
maintained by hand.

## Decision

Stay with `apiFetch`. Two structural conflicts make RPC a poor fit here:

1. **RPC requires chained route definitions to infer types.** The entire
   API is built on `create<X>Router(config)` factories with standalone
   `router.get(...)` statements and facade composition
   ([routes/README.md](../../admin-api/src/routes/README.md)) — the pattern
   that makes config injection, per-domain testing and the recent
   sub-resource split work. Converting every factory to a single chained
   expression would sacrifice that structure for type inference.
2. **`apiFetch` is load-bearing observability infrastructure.** It owns
   trace-context injection, request-id propagation, outbound RED metrics
   with low-cardinality path templates, structured per-call logs and the
   401-refresh-retry ([\_api-client.ts](../../src/server/_api-client.ts)).
   An `hc` client would need all of that re-implemented in a custom fetch
   wrapper, erasing most of the simplicity RPC promises.

The residual risk — a route's response shape changing without the client
noticing — is bounded in practice: both sides live in one repository, the
route files and their `apiFetch` call sites change in the same PR, and the
E2E-style Jest suites exercise the real routers.

## Alternatives considered

- **Adopt Hono RPC wholesale** — rejected for the two conflicts above.
- **RPC for new routes only** — rejected: two client idioms and two route
  styles cost more in consistency than the type inference returns.
- **Shared response-type package** (types imported by both sides without
  RPC) — viable middle ground; adopt opportunistically where drift actually
  bites rather than pre-emptively.

## Consequences

- Response types in `src/server/*.ts` remain hand-declared; a mismatch
  surfaces at runtime (or in tests), not at compile time.
- The factory/facade architecture, per-domain `__tests__`, and the
  observability envelope in `apiFetch` remain untouched.
- New endpoints must keep passing explicit `pathTemplate` labels so
  Prometheus cardinality stays bounded.
