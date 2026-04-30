---
name: verify-endpoint-connectivity
description: Confirm a Tucaken server function reaches the correct admin-api pod. Covers ADMIN_API_URL resolution, Authorization Bearer forwarding, apiFetch error surface, Vitest fetch mock for URL/header assertions, and K8s pod log access. Admin-api runs live in the Kubernetes cluster (cdk-monitoring repo).
type: core
library: tucaken-app
library_version: initial-development
sources:
  - src/server/applications.ts
  - src/server/github.ts
  - src/__tests__/server/github.test.ts
requires:
  - add-server-function
---

# verify-endpoint-connectivity

Verify that a Tucaken server function reaches the correct admin-api pod in the Kubernetes cluster, forwards the session JWT, and surfaces errors cleanly. Use this skill when diagnosing connectivity failures, writing fetch-level tests, or auditing that a new server function hits the right URL with the right headers.

## Setup

**Admin-api is never available locally.** It runs live in the Kubernetes cluster managed by the `cdk-monitoring` repo. Developers connect to the live cluster during development — there is no local admin-api process to start or stop.

**In-cluster DNS format:**

```
http://<service-name>.<namespace>:<port>
http://admin-api.admin-api:3002
```

**ADMIN_API_URL resolution** — every server file declares this constant at the top of the module:

```typescript
const ADMIN_API_URL = process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'
```

The env var is injected by the Kubernetes deployment manifest. The fallback (`http://admin-api.admin-api:3002`) is the in-cluster DNS address and is the value used in all tests.

**Cluster access** requires credentials configured via the `cdk-monitoring` repo. Without cluster access, `kubectl` commands will fail.

---

## Core Patterns

### 1. apiFetch — URL construction and auth header

All requests to admin-api go through the shared `apiFetch` helper. Never call `fetch` directly inside a handler.

```typescript
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken() // reads __session cookie
  const res = await fetch(`${ADMIN_API_URL}/api/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`, // JWT forwarded from __session cookie
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`admin-api ${res.status}: ${text}`) // error format: "admin-api <status>: <body>"
  }
  return res.json() as Promise<T>
}
```

Key facts:
- The full URL is `${ADMIN_API_URL}/api/admin${path}`. For path `/github/repos` the final URL is `http://admin-api.admin-api:3002/api/admin/github/repos`.
- The `Authorization` header is always `Bearer <jwt>`. The JWT comes from the `__session` cookie via `getSessionToken()`.
- Caller-supplied headers in `init.headers` merge after the defaults, allowing `Content-Type` to be overridden for multipart requests.

---

### 2. apiFetch error surface

`apiFetch` throws a single `Error` whose message follows the format `admin-api <status>: <body>`. Use this format to branch on specific HTTP statuses:

| Error message prefix | Meaning | Recommended action |
|---|---|---|
| `admin-api 401: ...` | JWT invalid or expired | Re-authenticate; check `__session` cookie |
| `admin-api 403: ...` | Valid JWT but insufficient permissions | Verify user role in admin-api |
| `admin-api 404: ...` | Resource does not exist | Catch and return `null` (see pattern 3) |
| `admin-api 500: ...` | Bug in admin-api | Check pod logs (see pattern 5) |
| `TypeError: Failed to fetch` | Network error — pod unreachable | Verify `ADMIN_API_URL` and pod health |

---

### 3. Catching 404 and returning null

When a resource may legitimately be absent, catch the 404 specifically and return `null`. Let all other errors propagate.

```typescript
export const getGitHubInstallationFn = createServerFn({ method: 'GET' })
  .middleware([securityHeadersMiddleware])
  .handler(async () => {
    await requireAuth()
    try {
      const body = await apiFetch<{ installation: GitHubInstallation }>('/github/installation')
      return body.installation
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('admin-api 404')) return null
      throw err // re-throw non-404 errors
    }
  })
```

Source: `src/server/github.ts` — `getGitHubInstallationFn`

---

### 4. Vitest fetch mock — assert URL and headers

Stub the global `fetch` with `vi.stubGlobal` to verify that a server function builds the correct URL and forwards the Bearer token. The mock must be registered before any imports that read `ADMIN_API_URL`.

```typescript
// src/__tests__/server/github.test.ts — full mock setup

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Helper: resolve a fetch call with a JSON body
const mockResponse = (data: unknown, ok = true, status = 200) => {
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
  })
}

it('calls correct URL with Bearer token', async () => {
  mockResponse({ repos: [] })
  const handler = getGitHubAccessibleReposFn as () => Promise<unknown>
  await handler()

  expect(fetchMock).toHaveBeenCalledWith(
    'http://admin-api.admin-api:3002/api/admin/github/repos',
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer mock-jwt-token',
        'Content-Type': 'application/json',
      }),
    }),
  )
})
```

**What to assert in every connectivity test:**
1. The full URL: `http://admin-api.admin-api:3002/api/admin<path>`
2. `Authorization: Bearer <token>` — confirms the JWT is forwarded
3. `Content-Type: application/json` — confirms the default header is present
4. For POST/DELETE handlers: the request `body` serialised with `JSON.stringify`

---

### 5. K8s pod log access

These commands require cluster access configured via the `cdk-monitoring` repo.

```bash
# Tail admin-api pod logs (the downstream service)
kubectl logs -n admin-api deployment/admin-api --tail=50

# Tail tucaken-app pod logs (the BFF layer)
kubectl logs -n start-admin deployment/start-admin --tail=50

# Confirm ADMIN_API_URL is injected correctly into the running pod
kubectl exec -n start-admin deployment/start-admin -- env | grep ADMIN_API
```

Use pod logs when:
- `apiFetch` throws `admin-api 500` — look for stack traces in admin-api logs.
- `TypeError: Failed to fetch` — confirm the pod is running and `ADMIN_API_URL` resolves.
- Auth errors (401/403) you cannot reproduce locally — check whether the JWT reaches admin-api intact.

---

## Common Mistakes

### CRITICAL — Hardcoding the admin-api URL instead of using the env var

**Wrong:**

```typescript
// Works only if a tunnel is open; breaks in the deployed container
const res = await fetch('http://localhost:3002/api/admin/things')
```

**Correct:**

```typescript
const ADMIN_API_URL = process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'
// ...
const res = await fetch(`${ADMIN_API_URL}/api/admin/things`)
```

In the deployed container `localhost` is the tucaken-app process itself, not admin-api. The env var is required for correct in-cluster routing.

Source: `src/server/applications.ts`

---

### HIGH — Calling `fetch` directly and omitting the Authorization header

**Wrong:**

```typescript
// No auth header — admin-api returns 401
const res = await fetch(`${ADMIN_API_URL}/api/admin/things`)
```

**Correct:**

```typescript
// apiFetch adds Authorization: Bearer <token> automatically
return apiFetch<{ things: Thing[] }>('/things')
```

Bypassing `apiFetch` means the `Authorization` header is absent. Admin-api rejects the request with 401, which surfaces to the user as an unexplained auth error.

Source: `src/server/applications.ts` — `apiFetch` helper

---

### HIGH — Not catching 404 — throws instead of returning null

**Wrong:**

```typescript
// Throws "admin-api 404: ..." when the installation doesn't exist yet
return (await apiFetch<{ installation: GitHubInstallation }>('/github/installation')).installation
```

**Correct:**

```typescript
try {
  const body = await apiFetch<{ installation: GitHubInstallation }>('/github/installation')
  return body.installation
} catch (err) {
  if (err instanceof Error && err.message.startsWith('admin-api 404')) return null
  throw err
}
```

A 404 from admin-api means the resource has not been created yet — it is a valid application state, not an error. Letting it propagate breaks query hooks and triggers UI error boundaries unnecessarily.

Source: `src/server/github.ts` — `getGitHubInstallationFn`

---

### HIGH — Asserting only the URL in tests, not the Authorization header

**Wrong:**

```typescript
// Passes even if the Bearer token is never sent
expect(fetchMock).toHaveBeenCalledWith(
  'http://admin-api.admin-api:3002/api/admin/things',
  expect.anything(),
)
```

**Correct:**

```typescript
expect(fetchMock).toHaveBeenCalledWith(
  'http://admin-api.admin-api:3002/api/admin/things',
  expect.objectContaining({
    headers: expect.objectContaining({
      Authorization: 'Bearer mock-jwt-token',
      'Content-Type': 'application/json',
    }),
  }),
)
```

The Authorization header is the mechanism that binds a request to a user. A test that does not assert it provides no coverage for the authentication contract.

Source: `src/__tests__/server/github.test.ts`

---

## References

- See also: `add-server-function/SKILL.md` — apiFetch pattern and ADMIN_API_URL setup (this skill extends those patterns with test and debug guidance)
