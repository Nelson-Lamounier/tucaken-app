---
title: CORS error in production
type: troubleshooting
tags: [cors, networking, bff, debugging, hono]
sources:
  - admin-api/src/index.ts
  - src/server/_api-client.ts
  - docs/concepts/networking-architecture.md
created: 2026-07-14
updated: 2026-07-14
---

# CORS error in production

## Symptom

The browser console shows a CORS failure against an admin-api URL — e.g.
`blocked by CORS policy: No 'Access-Control-Allow-Origin' header` — or a
preflight `OPTIONS` request to `/api/admin/*` fails.

## Why this should never happen under the pod-to-pod model

In production, **no browser request is supposed to reach admin-api at
all**. Every data call originates from a tucaken-app server function
running inside the cluster, which calls
`http://admin-api.admin-api:3002` over Kubernetes service DNS —
server-to-server traffic has no CORS
([src/server/_api-client.ts](../../src/server/_api-client.ts#L29-L30)).
The CORS allowlist on admin-api (`https://tucaken.io`,
`http://localhost:3000`, `http://localhost:5001`) exists purely as
defence-in-depth for a future client-side fetch
([admin-api/src/index.ts](../../admin-api/src/index.ts#L93-L115)).

A production CORS error therefore means **something is calling admin-api
from the browser** — the interesting question is what, not how to loosen
the allowlist.

## Root causes, most likely first

1. **A component fetches admin-api directly** instead of going through a
   server function. Typically a new feature that copied a fetch pattern
   from a client-side context. The fix is to move the call behind
   `createServerFn` + `apiFetch`
   ([src/server/_api-client.ts](../../src/server/_api-client.ts)).
2. **A hard-coded admin-api URL leaked into client code.** `ADMIN_API_URL`
   is a server-side env var; any `VITE_`-prefixed or literal
   `admin.nelsonlamounier.com` URL in `src/` client code is a bug.
3. **The page is served from a non-canonical origin.** All four product
   hosts currently serve the app with no redirect (see
   [request lifecycle](../concepts/request-lifecycle-browser-to-pod.md)) —
   but only `https://tucaken.io` is in the CORS allowlist. A user browsing
   on `tucaken.com` who triggers any direct browser call to admin-api will
   see CORS failures that `tucaken.io` users do not.
4. **Local development against the cluster** from a port other than 3000
   or 5001 — the only dev origins admitted.

## Diagnosis

1. In the browser Network tab, find the failing request and note its
   `Origin` header and the exact target URL.
2. If the target is `admin.nelsonlamounier.com` or any admin-api URL: find
   the call site — `grep -rn "admin.nelsonlamounier\|ADMIN_API_URL" src/`
   and check it is not client-reachable code.
3. If the `Origin` is a product host other than `tucaken.io`: cause 3 —
   the page itself is on a non-canonical domain.
4. Confirm the server-function path works: the same operation performed
   through the UI flow that uses `apiFetch` should succeed regardless of
   CORS, because it never leaves the cluster.

## Fix

- Causes 1-2: move the call into a server function; never expose admin-api
  URLs to the client bundle.
- Cause 3: either add the origin to the allowlist deliberately
  ([admin-api/src/index.ts](../../admin-api/src/index.ts#L93-L115)) or —
  better — implement the planned canonical-host 301 redirect at the ALB so
  non-canonical hosts stop serving the app.
- Cause 4: run the dev server on port 5001 (`yarn dev`) or 3000.

## Prevention

Treat the CORS allowlist as an alarm, not a knob. If a change makes you
want to widen it, the change is probably routing browser traffic to a
surface designed for pod-to-pod calls — re-read
[networking architecture](../concepts/networking-architecture.md) first.

<!--
Evidence trail (auto-generated):
- Source: admin-api/src/index.ts CORS block (read on 2026-07-14)
- Source: src/server/_api-client.ts (read on 2026-07-14)
- Source: kubernetes-bootstrap tucaken-app ingress hosts (read on 2026-07-14)
-->
