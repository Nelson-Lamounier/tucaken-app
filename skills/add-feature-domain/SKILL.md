---
name: add-feature-domain
description: Scaffold a new Tucaken feature module under src/features/<domain>/. Covers canonical directory structure, type file placement, query key extension, server function separation, TanStack Form for user-facing forms, and reuse-first discipline before creating new code.
type: core
library: tucaken-app
library_version: initial-development
sources:
  - src/features/github/components/GitHubAccountSection.tsx
  - src/features/github/components/GitHubConnectedRepos.tsx
  - src/features/github/hooks/use-github-installation.ts
  - src/features/github/hooks/use-github-connected-repos.ts
  - src/server/github.ts
  - src/lib/types/github.types.ts
  - src/lib/api/query-keys.ts
  - src/app/_dashboard.settings.github.tsx
---

# add-feature-domain

Scaffold a complete feature module in Tucaken. This skill covers every layer — types, server functions, query hooks, UI components, and the route — and enforces the reuse-first rule before any new code is written.

## Setup

**Reuse audit — do this first, before creating anything:**

```bash
find src/components -name "*.tsx"
```

Check `src/components/ui/` for Button, DashboardPage, LinkCard, and other primitives. Creating duplicates is a HIGH failure mode. If what you need already exists, use it.

**Path alias:** `@/` maps to `src/`. All imports use `@/`.

**Admin-api** runs in Kubernetes and is not available locally. Server functions call it over the network.

---

## Core Patterns

### 1. Canonical directory structure

```
src/
├── features/
│   └── <domain>/
│       ├── components/          ← UI components for this feature
│       └── hooks/               ← TanStack Query hooks
├── server/
│   └── <domain>.ts              ← ALL server functions (NOT inside features/)
├── lib/
│   ├── types/
│   │   └── <domain>.types.ts    ← Type definitions
│   └── api/
│       └── query-keys.ts        ← Add namespace here
└── app/
    └── _dashboard.<domain>.tsx  ← Route (thin — just wires components)
```

Create these files in this order: types → server → query keys → hooks → components → route.

---

### 2. Types file

Place types at `src/lib/types/<domain>.types.ts`. Use `readonly` on all interface fields. Use a union type for status enums rather than a TypeScript `enum`.

```typescript
// src/lib/types/<domain>.types.ts

export interface <Resource> {
  readonly id: string
  readonly name: string
  readonly createdAt: string
}

export type <Resource>Status = 'pending' | 'active' | 'error'
```

Source: `src/lib/types/github.types.ts`

---

### 3. Server functions

All server functions go in `src/server/<domain>.ts`. Never place them inside `src/features/`.

```typescript
// src/server/<domain>.ts
import { createServerFn } from '@tanstack/start'

export const get<Resource>Fn = createServerFn({ method: 'GET' })
  .handler(async () => {
    // call admin-api here
    return data
  })

export const create<Resource>Fn = createServerFn({ method: 'POST' })
  .validator((data: <InputType>) => data)
  .handler(async ({ data }) => {
    // call admin-api here
  })
```

Source: `src/server/github.ts`

**See also:** `add-server-function/SKILL.md` — detailed patterns for server function authoring.

---

### 4. Query key namespace

Extend the `adminKeys` object in `src/lib/api/query-keys.ts`. Follow the hierarchy: `adminKeys.all` → `adminKeys.<namespace>.all` → `adminKeys.<namespace>.<key>()`. Invalidating a parent clears all descendants.

```typescript
// Inside the adminKeys object in src/lib/api/query-keys.ts:
<domain>: {
  all: ['admin', '<domain>'] as const,
  list: () => ['admin', '<domain>', 'list'] as const,
  detail: (id: string) => ['admin', '<domain>', 'detail', id] as const,
},
```

Source: `src/lib/api/query-keys.ts`

---

### 5. Query hooks

Place hooks in `src/features/<domain>/hooks/`. One hook per concern.

**Simple fetch:**

```typescript
// src/features/<domain>/hooks/use-<resource>.ts
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { get<Resource>Fn } from '@/server/<domain>'
import type { <Resource> } from '@/lib/types/<domain>.types'

export function use<Resource>() {
  return useQuery<<Resource> | null>({
    queryKey: adminKeys.<domain>.list(),
    queryFn: () => get<Resource>Fn(),
  })
}
```

**Mutation with invalidation and toast:**

```typescript
// src/features/<domain>/hooks/use-create-<resource>.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { create<Resource>Fn } from '@/server/<domain>'
import { useToastStore } from '@/lib/stores/toast-store'

export function useCreate<Resource>() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  return useMutation({
    mutationFn: (data: <InputType>) => create<Resource>Fn({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.<domain>.all })
    },
    onError: (err: Error) => {
      addToast('error', `Failed to create <resource>: ${err.message}`)
    },
  })
}
```

Source: `src/features/github/hooks/use-github-installation.ts`, `src/features/github/hooks/use-github-ingestion.ts`

**See also:** `add-query/SKILL.md` — polling, conditional refetch, and invalidation rules.

---

### 6. TanStack Form for user-facing forms

Use `useForm` from `@tanstack/react-form` with `zodValidator()` for **every** form that accepts user input. Never use a raw `useMutation` with manual state for multi-field forms.

```typescript
// src/features/<domain>/components/<Resource>Form.tsx
'use client'
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { z } from 'zod'
import { useCreate<Resource> } from '@/features/<domain>/hooks/use-create-<resource>'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

export function <Resource>Form() {
  const { mutateAsync } = useCreate<Resource>()

  const form = useForm({
    defaultValues: { name: '', description: '' },
    validatorAdapter: zodValidator(),
    onSubmit: async ({ value }) => {
      await mutateAsync(value)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.Field name="name" validators={{ onChange: schema.shape.name }}>
        {(field) => (
          <input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>
      <button type="submit">Submit</button>
    </form>
  )
}
```

Source: `package.json` — `@tanstack/react-form`, `@tanstack/zod-form-adapter`

---

### 7. Feature components

Place components at `src/features/<domain>/components/`. Components receive data from hooks — they do not call server functions directly.

```typescript
// src/features/<domain>/components/<Resource>List.tsx
'use client'
import { use<Resource> } from '@/features/<domain>/hooks/use-<resource>'

export function <Resource>List() {
  const { data, isPending, isError } = use<Resource>()

  if (isPending) return <div>Loading...</div>
  if (isError) return <div>Error loading data.</div>

  return (
    <ul>
      {data?.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  )
}
```

Source: `src/features/github/components/GitHubConnectedRepos.tsx`

---

### 8. Route (thin)

The route file wires components only. No data fetching, no business logic.

```tsx
// src/app/_dashboard.<domain>.tsx
import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { <Resource>List } from '@/features/<domain>/components/<Resource>List'

export const Route = createFileRoute('/_dashboard/<domain>')({
  component: <Domain>Route,
})

function <Domain>Route() {
  return (
    <DashboardPage title="<Domain>" description="Manage your <domain>.">
      <<Resource>List />
    </DashboardPage>
  )
}
```

Source: `src/app/_dashboard.settings.github.tsx`

**See also:** `add-route/SKILL.md` — `_dashboard.` prefix requirement, nav wiring, search params.

---

## Common Mistakes

### HIGH — Server functions placed inside the feature directory

**Wrong:**

```
src/features/billing/server/billing.ts
```

**Correct:**

```
src/server/billing.ts
```

Server functions are a distinct layer from UI. Placing them inside `features/` blurs the BFF/UI boundary and makes cross-feature reuse of the same API call impossible.

Source: `src/server/` directory structure

---

### HIGH — Using raw useMutation instead of TanStack Form for user-facing forms

**Wrong:**

```typescript
function MyForm() {
  const [name, setName] = useState('')
  const { mutate } = useMutation({ mutationFn: createResourceFn })

  return (
    <form onSubmit={() => mutate({ name })}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
    </form>
  )
}
```

**Correct:** Use `useForm` + `zodValidator()` as shown in pattern 6 above.

Raw `useMutation` with `useState` misses field-level validation, per-field error messages, dirty state tracking, and the submission lifecycle (isSubmitting, submission errors). TanStack Form handles all of this through `field.state.meta`.

Source: `package.json` — `@tanstack/react-form`, `@tanstack/zod-form-adapter`

---

### HIGH — Creating UI components without auditing existing ones

**Before creating any component, run:**

```bash
find src/components -name "*.tsx"
```

Button, DashboardPage, LinkCard, and other primitives already exist in `src/components/ui/`. Creating duplicates introduces visual inconsistency and doubles maintenance burden.

Source: `src/components/ui/`

---

### MEDIUM — Inline query keys instead of adminKeys

**Wrong:**

```typescript
useQuery({ queryKey: ['billing', 'plans'], ... })
```

**Correct:**

```typescript
useQuery({ queryKey: adminKeys.billing.plans(), ... })
```

Inline keys cannot be invalidated by namespace. `queryClient.invalidateQueries({ queryKey: adminKeys.billing.all })` will never match an inline key.

Source: `src/lib/api/query-keys.ts`

---

### MEDIUM — Fat route with inline data fetching

**Wrong:**

```tsx
function BillingRoute() {
  const { data } = useQuery({ queryKey: ['billing'], queryFn: getBillingFn })
  return <div>{data?.plan}</div>
}
```

**Correct:** Move the hook into a component in `src/features/<domain>/components/`. The route renders that component — nothing else.

Routes that embed query hooks, form state, or mutation calls cannot be composed or tested in isolation.

Source: `src/app/_dashboard.settings.github.tsx`

---

## Cross-references

- See also: `add-route/SKILL.md` — `_dashboard.` prefix, nav wiring, search params, DashboardPage.
- See also: `add-query/SKILL.md` — polling, conditional refetch, cache invalidation rules.
- See also: `add-server-function/SKILL.md` — server function authoring; server functions go in `src/server/`, not `features/`.
- See also: `maintainability-review/SKILL.md` — review structure before merging.
