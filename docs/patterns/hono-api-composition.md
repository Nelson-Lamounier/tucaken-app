---
title: Hono API composition — factories, typed context, middleware tiers
type: pattern
tags: [hono, typescript, bff, middleware, dependency-injection, zod, observability, testing]
sources:
  - admin-api/src/index.ts
  - admin-api/src/lib/types.ts
  - admin-api/src/lib/validate.ts
  - admin-api/src/lib/route-error-boundary.ts
  - admin-api/src/middleware/observability.ts
  - admin-api/src/middleware/user-provision.ts
  - admin-api/src/middleware/deleted-user-gate.ts
  - admin-api/src/routes/github/webhook.ts
created: 2026-07-18
updated: 2026-07-18
---

# Hono API composition — factories, typed context, middleware tiers

How admin-api applies Hono as a server-side TypeScript API framework: the
composition pattern, the type-system usage, the middleware-as-security-model,
and the conventions every new route must follow. admin-api is a BFF on
`@hono/node-server` (port 3002) consumed pod-to-pod by tucaken-app server
functions — Hono's job is routing, middleware composition and typed context;
business logic and SQL live in `lib/` ([lib README](../../admin-api/src/lib/README.md)).

## Router factories as dependency injection

Every domain exports a factory, never an app instance:

```ts
export function createProjectsRouter(config: AdminApiConfig): Hono<AdminApiBindings>
```

[index.ts](../../admin-api/src/index.ts) runs `loadConfig()` once at boot
(fail-fast: missing env = CrashLoopBackOff, visible in ArgoCD, instead of a
runtime error hours later) and injects the config into each factory. Handlers
close over `config`; tests call the factory with a stub — constructor
injection without a container. Large domains compose facades: `github.ts`,
`applications.ts` and `projects.ts` mount sub-resource routers with
`router.route('/', sub)`, keeping one stable import path per domain. Mount
order inside facades is load-bearing: literal paths (`/scheduled-interviews`,
`/clustering/*`) register before `/:slug` / `/:id` param routers so they are
never captured as parameters.

## Typed context: generics for auth, augmentation for cross-cutting state

Two Hono typing mechanisms, used for different scopes
([lib/types.ts](../../admin-api/src/lib/types.ts)):

- **Generics for the authenticated surface** — protected routers are
  `Hono<AdminApiBindings>` with `Variables: { jwtPayload, userId, isNewUser }`.
  The doc comment carries the security rule the types teach: use `userId`
  (the provisioned `users.id` UUID), never `jwtPayload.sub`, as the RLS scope.
- **Module augmentation for universal variables** —
  [observability.ts](../../admin-api/src/middleware/observability.ts)
  declares `requestId` and `logger` on Hono's global `ContextVariableMap`, so
  `ctx.get('logger')` is typed on every context regardless of generics.
- The webhook router is plain `Hono` — unauthenticated, so no user-typed
  context can exist. The types mirror the trust tiers.

## Middleware registration order is the security model

One listener, four trust tiers, expressed entirely by `app.use`/`app.route`
sequencing in [index.ts](../../admin-api/src/index.ts): observability on `*`;
CORS on `/api/admin/*`; probes, the HMAC webhook and `/api/public` mounted
BEFORE the JWT middleware; Cognito M2M on `/api/internal/*`; then the JWT
pipeline (verify → provision → deleted-user gate) on `/api/admin/*`, with
`requireAdminGroup()` layered on specific staff mounts. The whole
authorisation posture is auditable from one screen of `index.ts`, and a
filesystem guard test (`plan-write-isolation.test.ts`) locks the most
sensitive mount-table property in CI.

Two middleware practices worth copying:

- **Lazy provisioning between auth and handlers**
  ([user-provision.ts](../../admin-api/src/middleware/user-provision.ts)):
  first request per Cognito sub upserts `users` atomically (including the
  pending Stripe link) inside one transaction, caches sub→id per pod, and
  never blocks the request on failure — handlers simply see no `userId` and
  return 503. Every handler can assume the user row exists.
- **The deleted-user gate**
  ([deleted-user-gate.ts](../../admin-api/src/middleware/deleted-user-gate.ts)):
  410 Gone for soft-deleted users with a 30 s TTL cache and an exact-segment
  carve-out for `/api/admin/me` (segment-matched, so a future
  `/api/admin/metrics` cannot silently bypass the gate). Known trade-off: a
  just-deleted user can act for up to the TTL, per pod.

## Handler conventions

- Guard clauses first: `requireUserId(ctx)` then bail with 401/503.
- All user-scoped data access through `withUser(pool, userId, fn)` — RLS is
  the isolation mechanism; Hono only extracts the identity.
- Body validation through [`jsonBody(schema)`](../../admin-api/src/lib/validate.ts)
  (a `@hono/zod-validator` wrapper): handlers receive typed payloads via
  `ctx.req.valid('json')`, and every validation failure responds with the
  uniform `400 { error: 'Validation failed', issues }` shape. Business
  allowlists (status sets, destination filters) stay in handlers; array
  fields that historically filtered bad elements instead of rejecting keep
  that contract (locked by tests).
- Errors: each domain router mounts
  [`domainErrorBoundary(tag)`](../../admin-api/src/lib/route-error-boundary.ts) —
  one JSON error shape, request-bound Pino logging (request_id + trace_id),
  upstream `err.status` preserved, no stack traces to clients. The app-level
  `onError`/`notFound` in index.ts backstop anything unhandled, and
  process-level `unhandledRejection`/`uncaughtException` handlers exit
  non-zero so Kubernetes restarts a clean pod.

## Webhook handling outside the auth perimeter

[github/webhook.ts](../../admin-api/src/routes/github/webhook.ts) is the
reference for authenticating with cryptography instead of network position:
raw body via `ctx.req.text()` before any parsing (HMAC signs exact bytes),
`timingSafeEqual` for the signature comparison, 501 when the secret is
unconfigured, and always 200 once the signature verifies — GitHub retries
non-2xx, and unhandled event types must not cause retry storms.

## Testing through the fetch interface

Suites call `router.request(path, init)` — Hono apps are plain
`Request → Response` functions, so 76 suites / ~600 tests run in seconds with
no ports or HTTP server. `jest.unstable_mockModule` stubs the lib layer (pg
pool, github-app, K8s clients); the E2E-style suites exercise the full
middleware + handler pipeline per domain.

## Deliberate non-adoptions

- **Hono RPC (`hono/client`)** — rejected; it requires chained route
  definitions (conflicts with the factory/facade pattern) and would bypass
  the observability envelope in `apiFetch`. See
  [ADR 0011](../decisions/0011-no-hono-rpc-keep-apifetch.md).
- **Streaming/SSE** — unused by design; live progress is client polling. See
  [ADR 0008](../decisions/0008-polling-over-sse.md). Hono's `streamSSE`
  exists if push-UX is ever revisited.

## Related

- [admin-api routes README](../../admin-api/src/routes/README.md) — domain map + auth tiers
- [Networking architecture](../concepts/networking-architecture.md) — where this API sits in the cluster
- [Cognito JWKS verification](../concepts/cognito-jwks-verification.md) — the JWT tier's crypto

<!--
Evidence trail (auto-generated):
- Source: admin-api/src/index.ts, lib/types.ts, lib/validate.ts,
  lib/route-error-boundary.ts, middleware/{observability,user-provision,deleted-user-gate}.ts,
  routes/github/webhook.ts (read on 2026-07-18)
- Source: admin-api test suites via `router.request` (read on 2026-07-18)
- Verified: yarn workspace @repo/admin-api typecheck + test (76 suites / 595 tests) on 2026-07-18
-->
