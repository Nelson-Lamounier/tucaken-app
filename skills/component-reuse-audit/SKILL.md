---
name: component-reuse-audit
description: Before creating any UI in Tucaken, audit src/components/ui/ and src/components/layouts/ for matching patterns. Covers the full component catalogue, Button variants, DashboardPage, LinkCard, GridListActions, Motion for React import rules, and compose-vs-create decision criteria.
type: core
library: tucaken-app
library_version: initial-development
sources:
  - src/components/ui/Button.tsx
  - src/components/ui/LinkCards.tsx
  - src/components/ui/GridListActions.tsx
  - src/components/ui/DashboardDrawer.tsx
  - src/components/ui/Field.tsx
  - src/components/ui/SectionHeader.tsx
  - src/components/ui/Tabs.tsx
  - src/components/ui/Stats.tsx
  - src/components/ui/Toaster.tsx
  - src/components/layouts/DashboardPage.tsx
  - .claude/rules/motion-react.md
---

# Component Reuse Audit

## Overview

Before writing any new UI code in Tucaken, run this audit. The shared component library covers buttons, cards, page layouts, drawers, tabs, form fields, and data-display primitives. Creating duplicates fragments visual consistency and re-introduces accessibility concerns (focus rings, disabled states) that the library already solves.

**See also:** `add-route/SKILL.md` — every new page route must wrap its body in `DashboardPage`. `add-feature-domain/SKILL.md` — scaffold checklist starts with this audit.

---

## Setup

### Step 1 — List all existing components

```bash
find src/components -name "*.tsx" | sort
find src/features -name "*.tsx" | sort
```

Run these before writing a single line of new JSX. If a file already models the pattern you need, use it.

### Step 2 — Decision criteria

| Pattern you need | Component to use |
|---|---|
| Any clickable button | `Button` with appropriate variant |
| Page-level heading + actions | `DashboardPage` |
| Item card with title/subtitle/status | `LinkCard` |
| Hub / action-grid layout | `GridListActions` |
| Slide-over panel | `DashboardDrawer` |
| Form field + label + validation | `FormInput` / `FormTextarea` from `Field` |
| Sub-section heading | `SectionHeader` |
| Tab navigation | `Tabs`, `TabUnderline`, or `TabbedContainer` |
| Metric display | `Stats` / `StatsCard` |
| Paginated list | `Pagination` / `CardPagination` |
| Toast notification | `useToastStore` + `Toaster` |
| Animation | `motion` from `motion/react` (never `framer-motion`) |

Only create a new component when **nothing** in the table above covers the pattern.

---

## Core Patterns

### Button

```tsx
import { Button } from '@/components/ui/Button'

// Confirm / save action
<Button variant="secondary" onClick={handleSave} disabled={isPending}>
  Save
</Button>

// Destructive action
<Button variant="danger" onClick={handleDelete} disabled={isPending}>
  Delete
</Button>

// Informational / additive action
<Button variant="primary" onClick={handleAdd}>
  Connect
</Button>

// Neutral / cancel
<Button variant="ghost" onClick={handleCancel}>
  Cancel
</Button>

// Large destructive (modal footer)
<Button variant="danger-lg" onClick={handleDelete}>
  Delete Account
</Button>

// Warning
<Button variant="warning" onClick={handleRevoke}>
  Revoke Access
</Button>
```

Sub-components for list editing:

```tsx
import { AddButton, RemoveButton, AddSubItemButton, RemoveSubItemButton, HeaderLink } from '@/components/ui/Button'

<AddButton onClick={handleAdd}>Add repository</AddButton>
<RemoveButton onClick={handleRemove} title="Remove repository" />
<AddSubItemButton onClick={handleAddSub}>Add tag</AddSubItemButton>
<RemoveSubItemButton onClick={handleRemoveSub} title="Remove tag" />

// Internal or external link styled as a header action
<HeaderLink to="/settings">Settings</HeaderLink>
<HeaderLink href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</HeaderLink>
```

Source: `src/components/ui/Button.tsx`

---

### DashboardPage

Wraps every authenticated page route. Never inline a heading.

```tsx
import { DashboardPage } from '@/components/layouts/DashboardPage'

// Minimal
<DashboardPage title="Reports">
  {children}
</DashboardPage>

// With description and header action
<DashboardPage
  title="GitHub"
  description="Connect your GitHub account to index repositories into the knowledge base."
  actions={<Button variant="primary">Connect GitHub</Button>}
>
  {children}
</DashboardPage>

// With a tab bar pinned to the header
<DashboardPage
  title="Applications"
  headerBottom={<TabUnderline tabs={tabs} onChange={setTab} />}
>
  {children}
</DashboardPage>
```

Props: `title` (ReactNode, required), `description?`, `actions?`, `headerBottom?`, `fullWidth?`, `children` (required).

Source: `src/components/layouts/DashboardPage.tsx`

---

### LinkCard

Use for any item list where each row has a title, subtitle, optional icon, optional top-right badge, and optional bottom action area.

```tsx
import { LinkCard } from '@/components/ui/LinkCards'

<LinkCard
  title="my-org/my-repo"
  subtitle="Last synced 3 minutes ago"
  topRight={<GitHubSyncStatusBadge status={repo.syncStatus} />}
  bottom={
    <Button variant="danger" onClick={() => removeRepo(repo.id)}>
      Remove
    </Button>
  }
/>

// With icon
<LinkCard
  icon={<GitHubIcon className="size-5 text-zinc-400" />}
  title="Repository Name"
  subtitle="owner/repo"
/>
```

Props: `title` (ReactNode), `subtitle` (ReactNode), `icon?`, `onClick?`, `topRight?`, `bottom?`.

Source: `src/components/ui/LinkCards.tsx`

---

### GridListActions

Use for hub pages with a grid of navigation tiles (e.g. the Applications Hub).

```tsx
import { GridListActions, type GridListAction } from '@/components/ui/GridListActions'
import { PlusCircleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

const actions: GridListAction[] = [
  {
    title: 'New Application',
    href: '/applications/new',
    icon: PlusCircleIcon,
    iconForeground: 'text-teal-400',
    iconBackground: 'bg-teal-500/10',
    description: 'Register a new application for indexing.',
  },
  {
    title: 'Configure Pipelines',
    onClick: openPipelineDrawer,
    icon: Cog6ToothIcon,
    iconForeground: 'text-indigo-400',
    iconBackground: 'bg-indigo-500/10',
    description: 'Manage ingestion pipelines.',
  },
]

<GridListActions actions={actions} />
```

`href` and `onClick` are mutually exclusive per tile. Provide one.

Source: `src/components/ui/GridListActions.tsx`

---

### DashboardDrawer

Slide-over panel, not a modal. Use for detail views, forms, and multi-step flows that should not replace the current page context.

```tsx
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'

const [open, setOpen] = useState(false)

<DashboardDrawer
  isOpen={open}
  onClose={() => setOpen(false)}
  title="Add Repository"
  description="Select a repository to connect."
  actions={<Button variant="secondary" onClick={handleSave}>Save</Button>}
>
  {/* drawer body */}
</DashboardDrawer>
```

`unstyledContent={true}` skips the inner scroll wrapper — use when the content manages its own scroll.

Source: `src/components/ui/DashboardDrawer.tsx`

---

### Form Fields

Always use `FormInput` / `FormTextarea` from `Field.tsx` inside TanStack Form field renderers. They wire `id`, `name`, `value`, `onBlur`, `onChange`, and validation errors automatically.

```tsx
import { FormInput, FormTextarea } from '@/components/ui/Field'

<form.Field name="slug">
  {(field) => (
    <FormInput label="Application Slug" field={field} placeholder="my-app" />
  )}
</form.Field>

<form.Field name="description">
  {(field) => (
    <FormTextarea label="Description" field={field} rows={4} />
  )}
</form.Field>
```

Source: `src/components/ui/Field.tsx`

---

### Motion for React

Never import from `framer-motion`. The package was renamed — that import crashes at runtime.

```tsx
// Client component (has 'use client' or is bundled client-side):
import { motion, AnimatePresence } from 'motion/react'

// Server component ONLY:
import * as motion from 'motion/react-client'

// animate() function in a React file:
import { animate } from 'motion/react'
```

Add `willChange` for any animated transform or opacity:

```tsx
<motion.div
  animate={{ x: 100, opacity: 1 }}
  style={{ willChange: 'transform, opacity' }}
/>
```

Only ever include `transform`, `opacity`, `clipPath`, or `filter` in `willChange`.

Source: `.claude/rules/motion-react.md`

---

## Common Mistakes

### CRITICAL — Importing from `framer-motion`

```tsx
// Wrong — crashes at runtime
import { motion } from 'framer-motion'

// Correct
import { motion } from 'motion/react'
```

The package was renamed. `framer-motion` is no longer installed in this project.

---

### HIGH — Creating a duplicate UI component

```tsx
// Wrong — inline card that reinvents LinkCard
function RepoCard({ repo }) {
  return (
    <div className="rounded-lg border border-zinc-700 p-4">
      <p className="text-white font-medium">{repo.name}</p>
      <p className="text-zinc-400 text-sm">{repo.fullName}</p>
    </div>
  )
}

// Correct — use the shared component
<LinkCard title={repo.name} subtitle={repo.fullName} />
```

Missing focus rings, hover states, `topRight` and `bottom` slots, and accessibility attributes.

Source: `src/components/ui/LinkCards.tsx`

---

### HIGH — Raw `<button>` instead of `Button`

```tsx
// Wrong — missing focus-visible, disabled styles, cursor-not-allowed
<button onClick={handler} className="text-red-400 border border-red-400">Delete</button>

// Correct
<Button variant="danger" onClick={handler} disabled={isPending}>Delete</Button>
```

Source: `src/components/ui/Button.tsx`

---

### HIGH — Inlining a page heading instead of using DashboardPage

```tsx
// Wrong
function GitHubPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100">GitHub</h2>
      <p className="text-sm text-zinc-400">Manage repos.</p>
      {children}
    </div>
  )
}

// Correct
function GitHubPage() {
  return (
    <DashboardPage title="GitHub" description="Manage repos.">
      {children}
    </DashboardPage>
  )
}
```

Bypasses the `actions` slot, `headerBottom` slot, and consistent heading type scale.

Source: `src/components/layouts/DashboardPage.tsx`

---

## References

- Full component catalogue with props and when-to-use guidance: `component-reuse-audit/references/component-catalogue.md`
- See also: `add-route/SKILL.md` — route scaffold always starts with `DashboardPage`
- See also: `add-feature-domain/SKILL.md` — feature scaffold checklist starts with this audit
- Motion for React rules: `.claude/rules/motion-react.md`
