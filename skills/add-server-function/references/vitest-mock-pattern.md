# Vitest Mock Pattern — TanStack Start Server Functions

Complete boilerplate for testing Tucaken server functions. Copy this file, adjust the import paths and domain names, and fill in your own test cases.

---

## Full template

```typescript
// src/__tests__/server/<domain>.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── 1. Mock createServerFn ────────────────────────────────────────────────
// createServerFn returns a builder chain. Each method returns `chain` so that
// .middleware().inputValidator().handler() all compose. The final .handler()
// call receives the handler function and returns it directly — this lets tests
// call the exported constant as a plain async function.

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {}
    chain.middleware = () => chain
    chain.inputValidator = () => chain
    chain.handler = (fn: unknown) => fn
    return chain
  },
}))

// ─── 2. Mock @tanstack/react-start/server ─────────────────────────────────
// getCookie must be a vi.fn() so tests can control the returned token.
// setCookie, deleteCookie, setResponseHeader are mocked to prevent side effects.

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  setResponseHeader: vi.fn(),
}))

import { getCookie } from '@tanstack/react-start/server'
const mockGetCookie = getCookie as unknown as ReturnType<typeof vi.fn>

// ─── 3. Mock auth-guard ────────────────────────────────────────────────────
// requireAuth resolves to a stub user by default. Override per-test with
// mockRejectedValueOnce to simulate unauthenticated / expired session errors.

vi.mock('../../server/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}))

import { requireAuth } from '../../server/auth-guard'
const mockRequireAuth = requireAuth as unknown as ReturnType<typeof vi.fn>

// ─── 4. Mock global fetch ─────────────────────────────────────────────────
// vi.stubGlobal replaces the global fetch used inside apiFetch.

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ─── 5. Import server functions AFTER all mocks ───────────────────────────
// Hoisting requires that vi.mock() calls precede the import of the module
// under test. Vitest hoists vi.mock() automatically, but explicit ordering
// here makes the dependency chain obvious during review.

import {
  // Replace with the actual exports from your domain file:
  getExampleFn,
  createExampleFn,
  removeExampleFn,
} from '../../server/example'

// ─── 6. Constants ─────────────────────────────────────────────────────────

const BASE = 'http://admin-api.admin-api:3002/api/admin'

// ─── 7. Helpers ───────────────────────────────────────────────────────────

/** Build a minimal fetch Response mock. */
function mockResponse(data: unknown, ok = true, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
  })
}

// ─── 8. Test suite ────────────────────────────────────────────────────────

describe('example server functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Provide a default session token so apiFetch can build the Authorization header.
    mockGetCookie.mockReturnValue('mock-jwt-token')
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ── GET handler ──────────────────────────────────────────────────────────

  describe('getExampleFn', () => {
    it('returns data when admin-api responds with 200', async () => {
      const item = { id: '1', name: 'thing' }
      mockResponse({ item })

      const handler = getExampleFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/examples/current`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-jwt-token',
            'Content-Type': 'application/json',
          }),
        }),
      )
      expect(result).toEqual(item)
    })

    it('returns null when admin-api responds with 404', async () => {
      mockResponse({ message: 'Not found' }, false, 404)

      const handler = getExampleFn as () => Promise<unknown>
      expect(await handler()).toBeNull()
    })

    it('re-throws non-404 errors from admin-api', async () => {
      mockResponse({ message: 'Internal error' }, false, 500)

      const handler = getExampleFn as () => Promise<unknown>
      await expect(handler()).rejects.toThrow('admin-api 500')
    })

    it('throws when requireAuth rejects', async () => {
      mockRequireAuth.mockRejectedValueOnce(new Error('Session expired or invalid'))

      const handler = getExampleFn as () => Promise<unknown>
      await expect(handler()).rejects.toThrow('Session expired or invalid')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('throws when session cookie is missing', async () => {
      mockGetCookie.mockReturnValue(undefined)

      const handler = getExampleFn as () => Promise<unknown>
      await expect(handler()).rejects.toThrow('Session cookie missing after auth guard')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  // ── POST handler ─────────────────────────────────────────────────────────

  describe('createExampleFn', () => {
    it('posts validated data and returns the created item', async () => {
      const created = { id: '2', name: 'new-thing' }
      mockResponse({ item: created })

      // POST handlers receive { data } — cast to match the handler signature
      const handler = createExampleFn as (args: { data: { name: string } }) => Promise<unknown>
      const result = await handler({ data: { name: 'new-thing' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/examples`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'new-thing' }),
          headers: expect.objectContaining({ Authorization: 'Bearer mock-jwt-token' }),
        }),
      )
      expect(result).toEqual({ item: created })
    })
  })

  // ── DELETE-via-POST handler ───────────────────────────────────────────────

  describe('removeExampleFn', () => {
    it('sends a DELETE to admin-api with the correct path', async () => {
      mockResponse({ success: true })

      const handler = removeExampleFn as (args: { data: { itemId: string } }) => Promise<unknown>
      const result = await handler({ data: { itemId: 'abc-123' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/examples/abc-123`,
        expect.objectContaining({ method: 'DELETE' }),
      )
      expect(result).toEqual({ success: true })
    })
  })
})
```

---

## Key points

| Mock target | Why |
|---|---|
| `@tanstack/react-start` (`createServerFn`) | The chain builder must return the raw handler function so tests can invoke it directly. |
| `@tanstack/react-start/server` (`getCookie`) | Controls the session token injected into `Authorization` headers. |
| `../../server/auth-guard` (`requireAuth`) | Allows both happy-path (resolved) and auth-failure (rejected) scenarios without real JWT verification. |
| `globalThis.fetch` | Intercepts all `apiFetch` calls without a real network or running admin-api. |

## Notes

- Always import the module under test **after** all `vi.mock()` declarations. Vitest hoists `vi.mock` automatically, but placing imports after mocks makes the order explicit and avoids confusion.
- Use `vi.clearAllMocks()` in `beforeEach` and `vi.resetAllMocks()` in `afterEach`. `clearAllMocks` resets call counts; `resetAllMocks` also removes any `mockResolvedValueOnce` queues left from previous tests.
- The `ADMIN_API_URL` env var defaults to `http://admin-api.admin-api:3002` when not set. Tests rely on this default matching the `BASE` constant defined above — do not set `process.env.ADMIN_API_URL` in tests unless you are specifically testing env override behaviour.
- Cast exported constants with `as (args: ...) => Promise<unknown>` to call them in tests. The mock chain makes TypeScript see each export as the raw handler function, but the type signature is not automatically inferred.
