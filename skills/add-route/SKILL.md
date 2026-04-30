---
name: add-route
description: Add a TanStack Router file-based route to Tucaken. Covers _dashboard filename prefix for auth inheritance, createFileRoute, Zod validateSearch, DashboardPage wrapper, and AppLayout navigation wiring.
type: core
library: tucaken-app
library_version: initial-development
sources:
  - src/app/_dashboard.settings.github.tsx
  - src/app/_dashboard.tsx
  - src/components/layouts/AppLayout.tsx
  - src/components/layouts/DashboardPage.tsx
  - vite.config.ts
---

# add-route

Add an authenticated, sidebar-wired page route to Tucaken using TanStack Router file-based routing.

## Setup

- Routes live in `src/app/`. TanStack Router's `routesDirectory` is set to `'app'` in `vite.config.ts`.
- Path alias: `@/` maps to `src/`.
- Auth guard lives in `src/app/_dashboard.tsx` — it redirects to `/login` when `context.auth.user` is falsy.
- To inherit that guard a route file **must** be prefixed with `_dashboard.`.

---

## Core Patterns

### 1. Route file

Filename convention: `src/app/_dashboard.<segment(s)>.tsx`

Examples:
- `/reports` → `src/app/_dashboard.reports.tsx`
- `/settings/github` → `src/app/_dashboard.settings.github.tsx`
- `/applications/:slug` → `src/app/_dashboard.applications.$slug.tsx`

Minimal route without search params:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/reports')({
  component: ReportsPage,
})

function ReportsPage() {
  return (
    <DashboardPage
      title="Reports"
      description="View pipeline and application activity reports."
    >
      <div className="max-w-2xl space-y-4">
        {/* feature components */}
      </div>
    </DashboardPage>
  )
}
```

### 2. Route with validated search params

Use `validateSearch` with a Zod schema. Always use `z.coerce` for params that arrive as strings from the URL.

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { DashboardPage } from '@/components/layouts/DashboardPage'

const searchSchema = z.object({
  installation_id: z.coerce.string().optional(),
  setup_action: z.coerce.string().optional(),
})

export const Route = createFileRoute('/_dashboard/settings/github')({
  validateSearch: searchSchema,
  component: GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const navigate = useNavigate()
  const { installation_id } = Route.useSearch()

  return (
    <DashboardPage
      title="GitHub"
      description="Connect your GitHub account to index repositories into the knowledge base."
    >
      <div className="max-w-2xl space-y-4">
        {/* feature components */}
      </div>
    </DashboardPage>
  )
}
```

### 3. DashboardPage props

All props except `title` and `children` are optional.

```tsx
<DashboardPage
  title="Page Title"                    // required — ReactNode
  description="Subtitle text."          // optional — shown below title
  actions={<Button>Create</Button>}     // optional — right-aligned header actions
  headerBottom={<TabNav />}             // optional — full-width row below header
  fullWidth={false}                     // optional — reserved for future use
>
  {/* page body */}
</DashboardPage>
```

### 4. Full-bleed route (skip main padding)

Use `staticData: { disableMainWrapper: true }` when the page needs edge-to-edge layout (e.g. a data table that manages its own scroll).

```tsx
export const Route = createFileRoute('/_dashboard/applications/list')({
  component: ApplicationsListPage,
  staticData: { disableMainWrapper: true },
})
```

`_dashboard.tsx` reads this flag via `useMatches` and skips the `<main className="py-10">` wrapper.

### 5. Wiring navigation in AppLayout

After creating a route file, add the route to the appropriate nav array in `src/components/layouts/AppLayout.tsx`. New routes without a nav entry are unreachable from the UI.

**Primary nav** — add to `navigation[]`:

```tsx
const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Reports',   href: '/reports', icon: ChartPieIcon },
  // ... existing entries
] as const
```

**Settings nav** — add to `settingsNavigation[]`:

```tsx
const settingsNavigation = [
  { name: 'GitHub', href: '/settings/github', icon: Github },
  { name: 'Webhooks', href: '/settings/webhooks', icon: WebhookIcon },
] as const
```

Icons for primary nav come from `@heroicons/react/24/outline`. Icons for settings/observability come from `lucide-react`. Match the existing pattern in the file.

### 6. Accessing browser APIs safely (SSR tension)

Route components render on the server during SSR. Any access to `window`, `localStorage`, `document`, or other browser globals **must** be deferred inside `useEffect`.

```tsx
import { useEffect, useState } from 'react'

function MyPage() {
  const [value, setValue] = useState<string | null>(null)

  useEffect(() => {
    setValue(localStorage.getItem('my-key'))
  }, [])

  return <DashboardPage title="My Page">{value}</DashboardPage>
}
```

---

## Common Mistakes

### CRITICAL — Wrong file prefix: missing `_dashboard.`

**Wrong:**

```
src/app/settings.github.tsx
```

```tsx
export const Route = createFileRoute('/settings/github')({
  component: GitHubSettingsPage,
})
```

**Correct:**

```
src/app/_dashboard.settings.github.tsx
```

```tsx
export const Route = createFileRoute('/_dashboard/settings/github')({
  component: GitHubSettingsPage,
})
```

Without the `_dashboard.` prefix the file is registered as a top-level route outside the `_dashboard` layout, so `beforeLoad` never runs and the page is publicly accessible with no auth check.

Source: `src/app/_dashboard.tsx`

---

### HIGH — Forgetting to add a navigation entry in AppLayout

**Wrong:** Route file created, nothing added to AppLayout.

**Correct:**

```tsx
// src/components/layouts/AppLayout.tsx

const navigation = [
  // ... existing
  { name: 'My New Page', href: '/my-new-page', icon: SomeIcon },
] as const
```

Without a matching entry in `navigation[]` or `settingsNavigation[]`, the route is reachable only by direct URL — there is no sidebar link.

Source: `src/components/layouts/AppLayout.tsx`

---

### HIGH — Inlining title/description instead of using DashboardPage

**Wrong:**

```tsx
function ReportsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">Reports</h2>
      <p className="text-sm text-zinc-500">View pipeline activity.</p>
      <div>{/* content */}</div>
    </div>
  )
}
```

**Correct:**

```tsx
function ReportsPage() {
  return (
    <DashboardPage title="Reports" description="View pipeline activity.">
      <div>{/* content */}</div>
    </DashboardPage>
  )
}
```

Inlining bypasses the shared heading styles, the `actions` slot, and the `headerBottom` slot. All page-level heading markup should go through `DashboardPage`.

Source: `src/components/layouts/DashboardPage.tsx`

---

### MEDIUM — Reading search params without `Route.useSearch()`

**Wrong:**

```tsx
import { useSearch } from '@tanstack/react-router'

const { installation_id } = useSearch({ strict: false })
```

**Correct:**

```tsx
const { installation_id } = Route.useSearch()
```

Using the route's own `useSearch()` gives typed, schema-validated search params. `useSearch({ strict: false })` returns an untyped union and bypasses `validateSearch`.

Source: `src/app/_dashboard.settings.github.tsx`

---

### MEDIUM — Accessing browser globals at module or render scope

**Wrong:**

```tsx
function MyPage() {
  const stored = localStorage.getItem('key') // crashes on server
  return <DashboardPage title="My Page">{stored}</DashboardPage>
}
```

**Correct:**

```tsx
function MyPage() {
  const [stored, setStored] = useState<string | null>(null)
  useEffect(() => {
    setStored(localStorage.getItem('key'))
  }, [])
  return <DashboardPage title="My Page">{stored}</DashboardPage>
}
```

SSR renders route components in a Node.js environment where `localStorage`, `window`, and `document` do not exist. Accessing them outside `useEffect` throws a runtime error during server render.

---

## Cross-references

- See also: `component-reuse-audit/SKILL.md` — check existing components before adding new page content.
