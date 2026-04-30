---
name: maintainability-review
description: Assess a Tucaken module for structure drift, duplication, and point-in-time fixes. Covers canonical file placement rules, Zustand-vs-TanStack Query scope, naming conventions, and the agent-specific failure pattern of solving the immediate task without considering codebase lifecycle.
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
  - src/lib/stores/
  - src/app/_dashboard.settings.github.tsx
---

# maintainability-review

Review a Tucaken feature module before it merges. This skill targets the two agent-specific failure signatures: **structure drift** (files placed where convenient, not where architecture requires) and **point-in-time fixes** (solving the immediate task without considering how the codebase will grow around it).

Run this review on every feature branch before merging. It takes five minutes and prevents months of cleanup.

---

## Setup

### Step 1 — Locate all files introduced or modified by the feature

```bash
git diff --name-only main...HEAD
```

Group the output into layers:

| Layer | Expected location |
|---|---|
| Server functions | `src/server/<domain>.ts` |
| Type definitions | `src/lib/types/<domain>.types.ts` |
| Query key namespace | `src/lib/api/query-keys.ts` |
| Query hooks | `src/features/<domain>/hooks/` |
| UI components | `src/features/<domain>/components/` |
| Shared components | `src/components/ui/` or `src/components/layouts/` |
| Route file | `src/app/_dashboard.<section>.<page>.tsx` |
| Zustand store | `src/lib/stores/<domain>-store.ts` |

Any file that does not map to one of these locations is a structure drift candidate.

### Step 2 — Run the checklist

Work through every item in the checklist below. Flag each failure with its severity before proposing fixes.

---

## Core Patterns

### 1. Canonical placement rules

```
CORRECT placements:
  src/server/<domain>.ts               ← all server functions
  src/lib/types/<domain>.types.ts      ← all type definitions
  src/lib/api/query-keys.ts            ← query key namespace (extend adminKeys)
  src/features/<domain>/hooks/         ← TanStack Query hooks
  src/features/<domain>/components/    ← feature UI components
  src/components/ui/                   ← shared UI primitives
  src/components/layouts/              ← shared layout components
  src/app/_dashboard.<section>.<page>.tsx  ← route (thin wiring only)
  src/lib/stores/<domain>-store.ts     ← Zustand (UI state ONLY)

WRONG placements (structure drift):
  src/features/<domain>/server/        ← server logic belongs in src/server/
  Co-located types in component files  ← types belong in src/lib/types/
  Server data in a Zustand store       ← server data belongs in TanStack Query cache
  Inline queryKey arrays in useQuery   ← must extend adminKeys factory
  Business logic in a route file       ← routes are thin wiring only
```

### 2. Zustand scope — UI state only

Zustand stores hold ephemeral UI state: open/closed panels, selected IDs, active filter values. They never hold server response data.

```typescript
// CORRECT — Zustand for UI state:
const useGithubUIStore = create(() => ({
  selectedRepoId: null as string | null,
  isFilterOpen: false,
  setSelectedRepo: (id: string | null) => set({ selectedRepoId: id }),
}))

// WRONG — server data in Zustand (causes sync bugs when cache invalidates):
const useGithubStore = create(() => ({
  repos: [] as ConnectedRepo[], // belongs in TanStack Query
  setRepos: (repos: ConnectedRepo[]) => set({ repos }),
}))

// CORRECT alternative — let TanStack Query own the server data:
const { data: repos } = useGitHubConnectedRepos()
```

Source: `src/lib/stores/` — all existing stores are UI-only.

### 3. Query key namespace

Every `useQuery` and `useMutation` must reference a key from `adminKeys`, never an inline array. Inline keys cannot be invalidated by namespace.

```typescript
// WRONG — inline key (invalidateQueries by parent namespace will miss this):
useQuery({ queryKey: ['billing', 'plans'], queryFn: getBillingPlansFn })

// CORRECT — extends adminKeys (hierarchical invalidation works):
// adminKeys.billing.all → ['admin', 'billing']
// adminKeys.billing.plans() → ['admin', 'billing', 'plans']
useQuery({ queryKey: adminKeys.billing.plans(), queryFn: getBillingPlansFn })

// Adding a new namespace in src/lib/api/query-keys.ts:
billing: {
  all: ['admin', 'billing'] as const,
  plans: () => ['admin', 'billing', 'plans'] as const,
  detail: (id: string) => ['admin', 'billing', 'detail', id] as const,
},
```

Source: `src/lib/api/query-keys.ts`

### 4. Naming conventions

| Artifact | Convention | Example |
|---|---|---|
| Component files | PascalCase | `GitHubAccountSection.tsx` |
| Hook files | kebab-case | `use-github-installation.ts` |
| Server function files | kebab-case | `github.ts` |
| Server function names | camelCase | `getGitHubInstallationFn` |
| Type files | kebab-case | `github.types.ts` |
| Route files | kebab-case | `_dashboard.settings.github.tsx` |
| Zustand store files | kebab-case | `github-ui-store.ts` |

### 5. Thin route files

Route files wire components only. If a route file contains any of the following, it is a point-in-time fix:

- `useQuery` or `useMutation` calls
- Inline type definitions (`interface`, `type`)
- Server function definitions (`createServerFn`)
- Component definitions beyond the single route component function

```typescript
// WRONG — everything crammed into the route file:
// src/app/_dashboard.billing.tsx
async function fetchBillingFn() { ... }       // → src/server/billing.ts
interface BillingPlan { ... }                 // → src/lib/types/billing.types.ts
function BillingCard({ plan }) { ... }        // → src/features/billing/components/BillingCard.tsx

export const Route = createFileRoute('/_dashboard/billing')({
  component: () => {
    const { data } = useQuery({ queryKey: ['billing'], queryFn: fetchBillingFn })
    return <BillingCard plan={data} />
  },
})

// CORRECT — thin route, each layer in its canonical location:
// src/app/_dashboard.billing.tsx
import { BillingCard } from '@/features/billing/components/BillingCard'

export const Route = createFileRoute('/_dashboard/billing')({
  component: BillingRoute,
})

function BillingRoute() {
  return (
    <DashboardPage title="Billing" description="Manage your subscription.">
      <BillingCard />
    </DashboardPage>
  )
}
```

Source: `src/app/_dashboard.settings.github.tsx`

### 6. Point-in-time fix detection

Point-in-time fixes work correctly right now but will break as the codebase grows. Common signatures:

```typescript
// WRONG — hardcoded value (breaks when environments differ):
const APP_SLUG = 'tucaken-admin'

// CORRECT — env var (survives environment changes):
const appSlug = import.meta.env['VITE_GITHUB_APP_SLUG'] as string | undefined

// WRONG — duplicated logic that already exists in a shared hook:
function MyComponent() {
  const [repos, setRepos] = useState([])
  useEffect(() => { fetchRepos().then(setRepos) }, [])
  // ...
}

// CORRECT — reuse the existing hook:
function MyComponent() {
  const { data: repos } = useGitHubConnectedRepos()
  // ...
}
```

---

## Review Checklist

Work through every item. Record pass / fail / n-a for each.

```
File placement
□ Server functions in src/server/<domain>.ts (not inside features/)?
□ Types in src/lib/types/<domain>.types.ts (not co-located with components)?
□ Route file is thin: no inline types, no server fns, no business logic?

Data layer
□ Query keys extend adminKeys (not inline arrays)?
□ Zustand stores contain only UI state (no server response arrays)?
□ Mutations invalidate via adminKeys namespace (not inline key)?

Components
□ Ran find src/components -name "*.tsx" before creating any new component?
□ No duplicate of Button, DashboardPage, LinkCard, GridListActions, etc.?
□ User-facing forms use TanStack Form + zodValidator (not raw useState + useMutation)?

Naming
□ Component files: PascalCase?
□ Hook files: kebab-case?
□ Type files: kebab-case?
□ Route files follow _dashboard.<section>.<page>.tsx pattern?

Point-in-time fixes
□ No hardcoded values that belong in env vars?
□ No logic duplicated from an existing hook or utility?
□ No commented-out workarounds left behind?
```

---

## Common Mistakes

### CRITICAL — Structure drift: server logic inside features/

**Wrong:**

```
src/features/billing/server/billing.ts   ← wrong layer, wrong directory
```

**Correct:**

```
src/server/billing.ts
```

Placing server functions inside `features/` blurs the BFF/UI boundary. Server functions are reusable across features; `features/` is UI-only.

Source: `src/server/` directory structure

---

### CRITICAL — Structure drift: inline types in route or component files

**Wrong:**

```typescript
// src/app/_dashboard.billing.tsx
interface BillingPlan {
  id: string
  name: string
}
```

**Correct:**

```typescript
// src/lib/types/billing.types.ts
export interface BillingPlan {
  readonly id: string
  readonly name: string
}
```

Co-located types cannot be imported by other features, hooks, or server functions without creating circular dependencies.

---

### HIGH — Point-in-time fix: server response data in Zustand

**Wrong:**

```typescript
// src/lib/stores/github-store.ts
const useGithubStore = create(() => ({
  repos: [] as ConnectedRepo[],   // server data — will drift from TanStack cache
  setRepos: (repos: ConnectedRepo[]) => set({ repos }),
}))
```

**Correct:**

```typescript
// Use TanStack Query as the single source of truth for server data:
const { data: repos } = useGitHubConnectedRepos()
```

When server data lives in both Zustand and TanStack Query, mutations only invalidate the TanStack cache. The Zustand copy goes stale and the UI diverges from the actual server state.

Source: `src/lib/stores/` — existing stores are UI-only.

---

### HIGH — Point-in-time fix: inline query keys

**Wrong:**

```typescript
useQuery({ queryKey: ['github', 'repos'], queryFn: getConnectedReposFn })
```

**Correct:**

```typescript
useQuery({ queryKey: adminKeys.github.repos(), queryFn: getConnectedReposFn })
```

`queryClient.invalidateQueries({ queryKey: adminKeys.github.all })` will never match an inline key. Namespace-level invalidation silently does nothing.

Source: `src/lib/api/query-keys.ts`

---

### HIGH — Point-in-time fix: hardcoded environment-specific values

**Wrong:**

```typescript
const APP_SLUG = 'tucaken-admin'  // breaks in staging or when the slug changes
```

**Correct:**

```typescript
const appSlug = import.meta.env['VITE_GITHUB_APP_SLUG'] as string | undefined
```

Hardcoded values that differ per environment will pass local review and fail in CI or production.

---

### HIGH — Creating a component without auditing existing ones

Before creating any component, run:

```bash
find src/components -name "*.tsx" | sort
```

`Button`, `DashboardPage`, `LinkCard`, `GridListActions`, `DashboardDrawer`, `FormInput`, `FormTextarea`, `SectionHeader`, `Tabs`, and `Stats` already exist. Creating duplicates fragments visual consistency and re-introduces accessibility concerns the library already solves.

Source: `src/components/ui/`, `src/components/layouts/`

---

### MEDIUM — Fat route file with embedded data fetching

**Wrong:**

```tsx
// src/app/_dashboard.github.tsx
function GitHubRoute() {
  const { data } = useQuery({ queryKey: ['github'], queryFn: getInstallationFn })
  return <div>{data?.login}</div>
}
```

**Correct:** Move the hook into `src/features/github/components/GitHubAccountSection.tsx` and render that component from the route. The route function contains only layout structure.

---

## Cross-references

- See also: `add-feature-domain/SKILL.md` — canonical scaffold structure; use this as the positive specification against which to measure drift.
- See also: `component-reuse-audit/SKILL.md` — full component catalogue and compose-vs-create decision criteria.
- See also: `add-query/SKILL.md` — polling, conditional refetch, and cache invalidation rules.
- See also: `add-server-function/SKILL.md` — server function authoring patterns; all server fns go in `src/server/`.
