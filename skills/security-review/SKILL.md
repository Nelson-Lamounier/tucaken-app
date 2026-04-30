---
name: security-review
description: Pre-merge security audit for Tucaken. Checks requireAuth on every server function, securityHeadersMiddleware scope, Zod inputValidator presence, encodeURIComponent for path params, VITE_ prefix isolation, and CSP connect-src coverage for new third-party services.
type: security
library: tucaken-app
library_version: initial-development
sources:
  - src/server/auth-guard.ts
  - src/server/security-headers.ts
  - src/server/github.ts
  - src/server/applications.ts
requires:
  - add-server-function
---

# Tucaken — Security Review Checklist

Run through each section before merging any server function changes.

---

## Auth Checks

### Check: `requireAuth()` present in every handler

Every server function MUST call `await requireAuth()` as its **first line** inside the handler. A handler without this call is an unauthenticated endpoint — the most critical failure mode.

**Correct:**
```typescript
export const getThingsFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    await requireAuth() // ← first line, no exceptions
    return apiFetch('/things')
  })
```

**Wrong — missing guard:**
```typescript
export const getThingsFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    return apiFetch('/things') // ← unauthenticated!
  })
```

**Wrong — guard called too late:**
```typescript
export const getThingsFn = createServerFn({ method: 'GET' })
  .handler(async ({ data }) => {
    const result = await apiFetch(`/things/${data.id}`) // ← runs before auth
    await requireAuth()
    return result
  })
```

**How to check:**
```bash
# Find every handler block and verify requireAuth is the first call
grep -n "handler(async" src/server/*.ts
# Then inspect each one — requireAuth must appear before any apiFetch or data access
```

---

## Security Headers Checks

### Check: `securityHeadersMiddleware` attached to all server functions

`securityHeadersMiddleware` applies HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and CSP. Currently it is only wired to `getUserSessionFn`. All server functions should carry these headers.

**Correct:**
```typescript
import { securityHeadersMiddleware } from '@/server/security-headers'

export const getThingsFn = createServerFn({ method: 'GET' })
  .middleware([securityHeadersMiddleware])
  .handler(async () => {
    await requireAuth()
    return apiFetch('/things')
  })
```

**Wrong — no middleware:**
```typescript
export const getThingsFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    await requireAuth()
    return apiFetch('/things') // ← no security headers on response
  })
```

**How to check:**
```bash
grep -L "securityHeadersMiddleware" src/server/*.ts
# Any file returned that contains createServerFn is missing the middleware
```

---

## Input Validation Checks

### Check: Zod `inputValidator` on every POST handler with user data

Every `POST` server function that accepts user-supplied data MUST declare an `.inputValidator(zodSchema)`. This validates and type-narrows `data` before it reaches the handler body, preventing unvalidated input from reaching the admin-api.

**Correct:**
```typescript
import { z } from 'zod'

const addRepoSchema = z.object({ repoFullName: z.string().min(1) })

export const addRepoFn = createServerFn({ method: 'POST' })
  .inputValidator(addRepoSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch(`/repos/${encodeURIComponent(data.repoFullName)}`, {
      method: 'POST',
    })
  })
```

**Wrong — no schema:**
```typescript
export const addRepoFn = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch(`/repos/${data.repoFullName}`, { method: 'POST' })
    // ← data.repoFullName is untyped and unvalidated
  })
```

**How to check:**
```bash
# Find all POST handlers
grep -n "method: 'POST'" src/server/*.ts
# Each must also have inputValidator — confirm with:
grep -n "inputValidator" src/server/*.ts
```

---

## Path Parameter Checks

### Check: `encodeURIComponent()` wrapping all user-supplied path segments

Any user-controlled value interpolated into a URL path must be wrapped with `encodeURIComponent()`. Without it, a value like `owner/repo/../../admin` becomes a path traversal exploit.

**Correct:**
```typescript
return apiFetch(`/repos/${encodeURIComponent(data.repoFullName)}`)
```

**Wrong — path traversal risk:**
```typescript
return apiFetch(`/repos/${data.repoFullName}`)
return apiFetch(`/orgs/${data.orgName}/members/${data.username}`)
```

**How to check:**
```bash
# Find all template literals passed to apiFetch that include data.*
grep -n "apiFetch(\`" src/server/*.ts
# Any ${data.*} segment not wrapped in encodeURIComponent is a finding
```

---

## Environment Variable Checks

### Check: No secrets or server-only values use the `VITE_` prefix

Variables prefixed with `VITE_` are inlined into the browser bundle by Vite at build time. Server-only values (API URLs, secrets, credentials) must use `process.env['VAR_NAME']` and must never carry the `VITE_` prefix.

**Correct — server-only, stays out of bundle:**
```typescript
const adminApiUrl = process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'
```

**Wrong — secret visible in browser bundle:**
```typescript
const secret = import.meta.env.VITE_ADMIN_API_SECRET
const adminUrl = import.meta.env.VITE_ADMIN_API_URL
```

**How to check:**
```bash
# Search all server files for VITE_ usage
grep -rn "VITE_" src/server/
# Any match is a critical finding

# Also check for new import.meta.env usage in server files
grep -rn "import\.meta\.env" src/server/
```

---

## CSP Checks

### Check: New third-party service domains added to `connect-src`

The CSP `connect-src` directive in `src/server/security-headers.ts` controls which external origins the browser may fetch from. When a new third-party service is added (analytics, monitoring, APIs), its domain must be added to the allowlist or the browser will block those requests.

**Current allowlist** (`src/server/security-headers.ts`):
```typescript
"connect-src 'self' https://*.nelsonlamounier.com https://*.amazonaws.com https://*.amazoncognito.com"
```

**How to update when adding a new service:**
```typescript
// Add the new domain to connect-src:
"connect-src 'self' https://*.nelsonlamounier.com https://*.amazonaws.com https://*.amazoncognito.com https://*.newservice.com"
```

**How to check:**
```bash
# Review the current CSP value
grep -A2 "connect-src" src/server/security-headers.ts

# Cross-reference with any new fetch() calls or SDK integrations in the diff
# If a new domain is contacted by browser code, it must appear in connect-src
```

---

## Common Security Mistakes

### 1. Missing `requireAuth()` — CRITICAL

```typescript
// Wrong — unauthenticated endpoint:
export const deleteThingFn = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    return apiFetch(`/things/${data.id}`, { method: 'DELETE' })
  })

// Correct:
export const deleteThingFn = createServerFn({ method: 'POST' })
  .middleware([securityHeadersMiddleware])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch(`/things/${encodeURIComponent(data.id)}`, { method: 'DELETE' })
  })
```

### 2. `securityHeadersMiddleware` missing — HIGH

```typescript
// Wrong — response has no security headers:
export const getThingsFn = createServerFn({ method: 'GET' })
  .handler(async () => { await requireAuth(); return apiFetch('/things') })

// Correct:
export const getThingsFn = createServerFn({ method: 'GET' })
  .middleware([securityHeadersMiddleware])
  .handler(async () => { await requireAuth(); return apiFetch('/things') })
```

### 3. `VITE_` prefix on a server-only value — CRITICAL

```typescript
// Wrong — leaks into browser bundle:
const url = import.meta.env.VITE_ADMIN_API_URL

// Correct:
const url = process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'
```

### 4. Unencoded path parameter — HIGH

```typescript
// Wrong — path traversal:
return apiFetch(`/orgs/${data.org}/repos/${data.repo}`)

// Correct:
return apiFetch(`/orgs/${encodeURIComponent(data.org)}/repos/${encodeURIComponent(data.repo)}`)
```

### 5. Missing `inputValidator` on POST — HIGH

```typescript
// Wrong — unvalidated data reaches admin-api:
export const createThingFn = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => { await requireAuth(); return apiFetch('/things', { method: 'POST', body: data }) })

// Correct:
const schema = z.object({ name: z.string().min(1).max(100) })
export const createThingFn = createServerFn({ method: 'POST' })
  .inputValidator(schema)
  .handler(async ({ data }) => { await requireAuth(); return apiFetch('/things', { method: 'POST', body: data }) })
```

---

## Pre-Merge Summary

- [ ] Every new server function calls `await requireAuth()` as the first line of the handler
- [ ] Every new POST server function has `.inputValidator(zodSchema)` before the handler
- [ ] Every path parameter using user input is wrapped in `encodeURIComponent()`
- [ ] No server-only values use the `VITE_` prefix — check `import.meta.env` usage in `src/server/`
- [ ] New third-party service domains have been added to `connect-src` in `src/server/security-headers.ts`
- [ ] `securityHeadersMiddleware` is attached to all new server functions via `.middleware([securityHeadersMiddleware])`
