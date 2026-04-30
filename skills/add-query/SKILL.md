---
name: add-query
description: Use when adding a TanStack Query useQuery or useMutation hook to Tucaken — fetching data, polling for pending/syncing states, invalidating cache after mutations, or showing toast feedback on error.
type: core
library: tucaken-app
library_version: initial-development
sources:
  - tucaken-app:src/lib/api/query-keys.ts
  - tucaken-app:src/features/github/hooks/use-github-installation.ts
  - tucaken-app:src/features/github/hooks/use-github-connected-repos.ts
  - tucaken-app:src/features/github/hooks/use-github-ingestion.ts
  - tucaken-app:src/app/__root.tsx
---

# Add Query

## Overview

Every data-fetching and mutation hook in Tucaken follows a consistent pattern: extend the `adminKeys` factory for cache keys, use conditional `refetchInterval` when polling resource statuses, invalidate all related keys after a mutation succeeds, and surface errors through `useToastStore`.

**See also:** `add-server-function/SKILL.md` — server functions are always paired with a query hook.

---

## Setup

**Global staleTime** (set in `src/app/__root.tsx`) is 5 minutes. You do not need to repeat it per hook unless you need a shorter window.

**Path alias:** `@/` maps to `src/`. All imports use `@/`.

---

## Core Patterns

### Simple useQuery

```typescript
// src/features/<domain>/hooks/use-<resource>.ts
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { get<Resource>Fn } from '@/server/<domain>'
import type { <Resource> } from '@/lib/types/<domain>.types'

export function use<Resource>() {
  return useQuery<<Resource> | null>({
    queryKey: adminKeys.<namespace>.<key>(),
    queryFn: () => get<Resource>Fn(),
  })
}
```

Source: `src/features/github/hooks/use-github-installation.ts`

---

### Conditional Polling

Use when a resource has transient statuses (e.g. `pending`, `syncing`) that resolve asynchronously. Poll only while active statuses exist; stop automatically after 10 minutes.

```typescript
// src/features/<domain>/hooks/use-<resource>.ts
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { get<Resource>Fn } from '@/server/<domain>'
import type { <Resource> } from '@/lib/types/<domain>.types'

const POLL_INTERVAL = 5_000
const POLL_TIMEOUT_MS = 10 * 60 * 1_000
const ACTIVE_STATUSES = new Set(['pending', 'syncing'])

export function use<Resource>() {
  const pollStartRef = useRef<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  const query = useQuery<<Resource>[]>({
    queryKey: adminKeys.<namespace>.<key>(),
    queryFn: () => get<Resource>Fn(),
    refetchInterval: (queryResult) => {
      if (timedOut) return false
      const data = queryResult.state.data
      if (!data) return false
      const hasActive = data.some((r) => ACTIVE_STATUSES.has(r.status))
      if (!hasActive) return false
      if (!pollStartRef.current) pollStartRef.current = Date.now()
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }
      return POLL_INTERVAL
    },
  })

  useEffect(() => {
    const data = query.data
    if (!data) return
    const hasActive = data.some((r) => ACTIVE_STATUSES.has(r.status))
    if (!hasActive) {
      pollStartRef.current = null
      setTimedOut(false)
    }
  }, [query.data])

  return { ...query, timedOut }
}
```

Source: `src/features/github/hooks/use-github-connected-repos.ts`

**Why `refetchInterval` callback, not a fixed number:**
- A fixed `refetchInterval: 5000` polls forever, even when all records are stable.
- The callback receives live query state — return `false` to stop, a number to continue.
- `timedOut` exposes runaway-poll state to the UI so you can render a warning.

---

### useMutation with Invalidation and Toast

```typescript
// src/features/<domain>/hooks/use-<action>.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { <action>Fn } from '@/server/<domain>'
import { useToastStore } from '@/lib/stores/toast-store'

export function use<Action>() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  return useMutation({
    mutationFn: (data: <InputType>) => <action>Fn({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.<namespace>.<key>() })
      // Invalidate every key whose data could have changed:
      void queryClient.invalidateQueries({ queryKey: adminKeys.<namespace>.all })
    },
    onError: (err: Error) => {
      addToast('error', `<Action> failed: ${err.message}`)
    },
  })
}
```

Source: `src/features/github/hooks/use-github-ingestion.ts`

**Invalidation rules:**
- Invalidate the specific list key that changed **and** any related list the mutation affects.
- Use `void` — `invalidateQueries` returns a Promise; not awaiting is intentional (fire-and-forget refetch).
- Do not put server response data into Zustand. Zustand is for ephemeral UI state only.

---

### Extending adminKeys for a New Namespace

Add inside the `adminKeys` object in `src/lib/api/query-keys.ts`:

```typescript
billing: {
  all: ['admin', 'billing'] as const,
  plans: () => ['admin', 'billing', 'plans'] as const,
  subscription: (userId: string) => ['admin', 'billing', 'subscription', userId] as const,
},
```

Hierarchy rule: `adminKeys.all` → `adminKeys.<namespace>.all` → `adminKeys.<namespace>.<key>()`. Invalidating a parent clears all descendants.

---

## Common Mistakes

### CRITICAL — Inline query keys

```typescript
// Wrong
useQuery({ queryKey: ['github', 'installation'], ... })

// Correct
useQuery({ queryKey: adminKeys.github.installation(), ... })
```

**Why it breaks:** Inline keys cannot be invalidated by namespace. `queryClient.invalidateQueries({ queryKey: adminKeys.github.all })` will never match an inline key, leaving stale data after mutations.

---

### HIGH — Fixed refetchInterval for status polling

```typescript
// Wrong
useQuery({ refetchInterval: 5000 })

// Correct
useQuery({
  refetchInterval: (queryResult) => {
    const hasActive = queryResult.state.data?.some(...)
    return hasActive ? 5_000 : false
  },
})
```

**Why it breaks:** Polling never stops. Every stable item continues firing network requests indefinitely.

---

### HIGH — Missing cache invalidation after mutation

```typescript
// Wrong
useMutation({ mutationFn: removeRepo })

// Correct
useMutation({
  mutationFn: removeRepo,
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
    void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
  },
})
```

**Why it breaks:** UI shows stale data. The user sees a deleted item still listed, or a newly added item missing, until the next natural refetch (5-minute staleTime).
