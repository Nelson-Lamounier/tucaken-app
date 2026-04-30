---
name: add-server-function
description: Create a TanStack Start createServerFn BFF handler in Tucaken. Covers method selection (GET vs POST), requireAuth guard, apiFetch helper, Zod inputValidator, ADMIN_API_URL env var, securityHeadersMiddleware, and Vitest mock pattern.
type: core
library: tucaken-app
library_version: initial-development
sources:
  - src/server/github.ts
  - src/server/auth-guard.ts
  - src/server/security-headers.ts
  - src/server/applications.ts
---

# add-server-function

Create a type-safe BFF server function in Tucaken using TanStack Start's `createServerFn`. Server functions are the only way to call the admin-api from the frontend — they run exclusively on the server, carry auth credentials, and expose a typed RPC surface to React components.

## Setup

- All server functions live in `src/server/<domain>.ts`.
- Path alias: `@/` maps to `src/`.
- The admin-api runs live in a Kubernetes cluster and is never available locally. Default URL: `http://admin-api.admin-api:3002`.
- `ADMIN_API_URL` is read from `process.env['ADMIN_API_URL']` and falls back to the cluster URL.
- Auth cookies are forwarded via TanStack Start's `getCookie` — only call it inside a handler, never at module scope.

---

## Core Patterns

### 1. File scaffold

Every domain file follows this structure:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getCookie } from '@tanstack/react-start/server'
import type { MyType } from '@/lib/types/my-domain.types'
import { requireAuth } from './auth-guard'
import { securityHeadersMiddleware } from './security-headers'

const ADMIN_API_URL = process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

function getSessionToken(): string {
  const token = getCookie('__session')
  if (!token) throw new Error('Session cookie missing after auth guard')
  return token
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  const res = await fetch(`${ADMIN_API_URL}/api/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`admin-api ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
```

### 2. GET handler (read, no body)

Use `method: 'GET'` only for pure reads with no request body.

```typescript
export const getThingsFn = createServerFn({ method: 'GET' })
  .middleware([securityHeadersMiddleware])
  .handler(async () => {
    await requireAuth()
    return apiFetch<{ items: MyType[] }>('/things')
  })
```

If the resource may not exist, catch the 404 and return `null` instead of letting `apiFetch` throw:

```typescript
export const getThingFn = createServerFn({ method: 'GET' })
  .middleware([securityHeadersMiddleware])
  .handler(async () => {
    await requireAuth()
    try {
      const body = await apiFetch<{ thing: MyType }>('/things/current')
      return body.thing
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('admin-api 404')) return null
      throw err
    }
  })
```

### 3. POST handler with Zod validation (write / mutation)

All writes — create, update, delete — use `method: 'POST'`. Pass a Zod schema to `.inputValidator()` and destructure `data` from the handler argument.

```typescript
const createThingSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
})

export const createThingFn = createServerFn({ method: 'POST' })
  .middleware([securityHeadersMiddleware])
  .inputValidator(createThingSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ thing: MyType }>('/things', {
      method: 'POST',
      body: JSON.stringify({ name: data.name, slug: data.slug }),
    })
  })
```

### 4. DELETE via POST (TanStack Start constraint)

TanStack Start does not support `method: 'DELETE'` on `createServerFn`. Issue DELETE requests to admin-api by setting `method: 'DELETE'` inside `apiFetch`, but keep the server function itself as `POST`:

```typescript
const removeThingSchema = z.object({ thingId: z.string().min(1) })

export const removeThingFn = createServerFn({ method: 'POST' })
  .middleware([securityHeadersMiddleware])
  .inputValidator(removeThingSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ success: boolean }>(
      `/things/${encodeURIComponent(data.thingId)}`,
      { method: 'DELETE', body: JSON.stringify({ thingId: data.thingId }) },
    )
  })
```

### 5. securityHeadersMiddleware

Apply `securityHeadersMiddleware` to every server function via `.middleware([securityHeadersMiddleware])`. It sets security response headers (CSP, HSTS, etc.) on every response without modifying handler logic.

```typescript
// src/server/security-headers.ts (already exists — import, do not redefine)
import { securityHeadersMiddleware } from './security-headers'
```

### 6. Calling a server function from a component

Server functions return a typed promise. Pair them with a TanStack Query hook (see `add-query/SKILL.md`) for reads, or call directly inside a mutation callback for writes:

```typescript
// Mutation example — no query hook needed for one-shot writes
const handleCreate = async () => {
  await createThingFn({ data: { name, slug } })
  queryClient.invalidateQueries({ queryKey: ['things'] })
}
```

---

## Common Mistakes

### CRITICAL — Using `method: 'GET'` for a mutation

**Wrong:**

```typescript
export const createThingFn = createServerFn({ method: 'GET' })
  .inputValidator(createThingSchema)
  .handler(async ({ data }) => { /* ... */ })
```

**Correct:**

```typescript
export const createThingFn = createServerFn({ method: 'POST' })
  .inputValidator(createThingSchema)
  .handler(async ({ data }) => { /* ... */ })
```

`method: 'GET'` server functions cannot carry a body. Attaching `.inputValidator` to a GET function compiles but silently discards the payload at runtime.

Source: `src/server/github.ts`

---

### CRITICAL — Omitting `await requireAuth()` inside the handler

**Wrong:**

```typescript
export const getThingsFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    return apiFetch('/things') // unauthenticated
  })
```

**Correct:**

```typescript
export const getThingsFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    await requireAuth()
    return apiFetch('/things')
  })
```

Every handler must call `await requireAuth()` as its first statement. Without it, the handler runs for unauthenticated requests and proxies auth-less calls to admin-api.

Source: `src/server/auth-guard.ts`

---

### HIGH — Wrong import path alias (`#/` instead of `@/`)

**Wrong:**

```typescript
import { requireAuth } from '#/server/auth-guard'
```

**Correct:**

```typescript
import { requireAuth } from '@/server/auth-guard'
```

The project alias is `@/` (maps to `src/`). Using `#/` silently resolves to a different path or fails at build time.

Source: `vite.config.ts`

---

### HIGH — Calling `getCookie()` at module scope

**Wrong:**

```typescript
// top-level, runs on import
const token = getCookie('__session')
```

**Correct:**

```typescript
// inside a function, called only within a handler
function getSessionToken(): string {
  const token = getCookie('__session')
  if (!token) throw new Error('Session cookie missing after auth guard')
  return token
}
```

`getCookie()` requires an active request context. Calling it outside a handler throws on module import and crashes the server before any request is served.

Source: `src/server/applications.ts` — `getSessionToken()` pattern

---

### HIGH — Silently ingesting admin-api 404 as an error instead of returning `null`

**Wrong:**

```typescript
export const getInstallationFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    await requireAuth()
    // throws when resource is absent — caller receives an error, not null
    return apiFetch<{ installation: Installation }>('/github/installation')
  })
```

**Correct:**

```typescript
export const getInstallationFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    await requireAuth()
    try {
      const body = await apiFetch<{ installation: Installation }>('/github/installation')
      return body.installation
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('admin-api 404')) return null
      throw err
    }
  })
```

A missing resource is not an application error. Callers expect `null` for "not found"; letting the 404 bubble as an exception breaks query hooks and UI error boundaries.

Source: `src/server/github.ts` — `getGitHubInstallationFn`

---

## References

- `references/vitest-mock-pattern.md` — complete Vitest mock boilerplate for server function tests (copy-paste template)
- See also: `add-query/SKILL.md` — server functions always pair with a TanStack Query hook for reads
- See also: `security-review/SKILL.md` — security checklist covers `requireAuth` and middleware
