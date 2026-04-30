---
name: router-architecture
description: Migrate Tucaken from flat _dashboard.*.tsx files to TanStack Router nested route groups. Covers directory-based nesting, layout route files, URL preservation during migration, and preventing further flat-file sprawl.
type: lifecycle
library: tucaken-app
library_version: initial-development
sources:
  - vite.config.ts
  - src/app/_dashboard.tsx
  - src/app/_dashboard.settings.github.tsx
  - src/components/layouts/AppLayout.tsx
requires:
  - add-route
---

# router-architecture

Incremental migration from Tucaken's flat `_dashboard.*.tsx` route files to TanStack Router directory-based nesting. Run one route group at a time — verify after each move before continuing.

---

## Setup

- `routesDirectory` is set to `'app'` in `vite.config.ts` (via `tanstackStart({ router: { routesDirectory: 'app' } })`).
- All authenticated routes inherit the auth guard in `src/app/_dashboard.tsx` — a file must remain inside `_dashboard` scope to get that guard.
- The exact directory nesting rules are version-dependent. Always verify each move with TanStack Router devtools before committing.

### Current flat structure

```
src/app/
├── __root.tsx
├── _dashboard.tsx                          ← layout route (stays at root level)
├── _dashboard.$.tsx                        ← 404 catch-all
├── _dashboard.index.tsx
├── _dashboard.ai-agent.tsx
├── _dashboard.applications.$slug.tsx
├── _dashboard.applications.index.tsx
├── _dashboard.applications.interview-prep.tsx
├── _dashboard.applications.list.tsx
├── _dashboard.applications.new.tsx
├── _dashboard.articles.tsx
├── _dashboard.calendar.tsx
├── _dashboard.comments.tsx
├── _dashboard.reports.tsx
├── _dashboard.resumes.edit.$id.tsx
├── _dashboard.resumes.new.tsx
├── _dashboard.resumes.tsx
├── _dashboard.settings.github.tsx
├── _dashboard.test.tsx
├── auth.callback.tsx
└── login.tsx
```

### Target nested structure

```
src/app/
├── __root.tsx
├── _dashboard.tsx              ← layout route (stays at root level — do not move)
├── _dashboard.$.tsx            ← 404 catch-all
├── _dashboard.index.tsx        ← dashboard home
├── login.tsx
├── auth.callback.tsx
│
└── _dashboard/                 ← nested group directory
    ├── applications/
    │   ├── index.tsx           ← was: _dashboard.applications.index.tsx
    │   ├── list.tsx            ← was: _dashboard.applications.list.tsx
    │   ├── new.tsx             ← was: _dashboard.applications.new.tsx
    │   ├── interview-prep.tsx  ← was: _dashboard.applications.interview-prep.tsx
    │   └── $slug.tsx           ← was: _dashboard.applications.$slug.tsx
    ├── settings/
    │   └── github.tsx          ← was: _dashboard.settings.github.tsx
    └── resumes/
        ├── index.tsx           ← was: _dashboard.resumes.tsx
        ├── new.tsx             ← was: _dashboard.resumes.new.tsx
        └── edit.$id.tsx        ← was: _dashboard.resumes.edit.$id.tsx
```

---

## Core Patterns

### 1. Migrate one route group (example: settings)

Always migrate one section at a time. Never move all files at once.

```bash
# Step 1 — create the target directory
mkdir -p src/app/_dashboard/settings

# Step 2 — move the file
mv src/app/_dashboard.settings.github.tsx src/app/_dashboard/settings/github.tsx
```

The `createFileRoute` path string inside the file may or may not need updating depending on the TanStack Router version. Check with devtools after the move.

```tsx
// Before (flat file): src/app/_dashboard.settings.github.tsx
export const Route = createFileRoute('/_dashboard/settings/github')({ ... })

// After (nested file): src/app/_dashboard/settings/github.tsx
// Path string is likely unchanged — verify in devtools
export const Route = createFileRoute('/_dashboard/settings/github')({ ... })
```

### 2. Verify the URL still resolves

```bash
yarn dev
# Navigate to /settings/github in the browser
# Open TanStack Router devtools — confirm route shows path /_dashboard/settings/github
# Confirm the page renders without errors
```

Only proceed to the next group after this check passes.

### 3. Run full verification

```bash
yarn typecheck && yarn lint && yarn test && yarn build
```

All gates must pass before committing the group move.

### 4. Commit each group separately

Keeping one group per commit makes bisecting trivial if a URL regression surfaces later.

```bash
git add src/app/_dashboard/settings/
git commit -m "refactor(routes): nest settings routes under _dashboard/settings/"
```

### 5. Adding new routes after migration starts

Once a section directory exists, all new routes for that section go inside it — never back to a flat file.

```bash
# New billing settings page
# WRONG — adds to flat structure:
src/app/_dashboard.settings.billing.tsx

# CORRECT — follows nesting:
src/app/_dashboard/settings/billing.tsx
```

For a brand-new top-level section that has not been migrated yet, use the flat convention until the section is ready to be moved as a group.

### 6. Updating AppLayout navigation after URL changes

If the nested directory structure changes any URL path, update `navigation[]` or `settingsNavigation[]` in `src/components/layouts/AppLayout.tsx` to match.

```tsx
// src/components/layouts/AppLayout.tsx
const settingsNavigation = [
  { name: 'GitHub', href: '/settings/github', icon: Github },
  // href must match the route path — update if directory nesting changes it
] as const
```

---

## Common Mistakes

### HIGH — Breaking URL paths when moving to nested directories

**Wrong:** Moving a file and assuming the URL is unchanged without verifying.

**Correct:** After every file move, open TanStack Router devtools and confirm:
1. The route appears in the route tree.
2. Its path matches the original URL.
3. The `createFileRoute(...)` string inside the file is consistent with what devtools reports.

The file path determines the URL in file-based routing — a wrong directory name silently registers a different URL.

Source: TanStack Router file-based routing + `vite.config.ts` `routesDirectory: 'app'`

---

### HIGH — Moving all route groups at once

**Wrong:**

```bash
mkdir -p src/app/_dashboard/{applications,settings,resumes}
mv src/app/_dashboard.applications.*.tsx src/app/_dashboard/applications/
mv src/app/_dashboard.settings.*.tsx     src/app/_dashboard/settings/
mv src/app/_dashboard.resumes.*.tsx      src/app/_dashboard/resumes/
```

**Correct:** Move one group, verify in devtools, run the full check suite, commit — then move the next group.

A bulk move that introduces a URL regression breaks the whole app. An incremental move limits blast radius to one section and makes rollback trivial.

---

### HIGH — Moving `_dashboard.tsx` itself into the directory

**Wrong:**

```bash
mv src/app/_dashboard.tsx src/app/_dashboard/index.tsx  # breaks layout inheritance
```

**Correct:** `_dashboard.tsx` is the layout route file. It must stay at the root of `src/app/`. Moving it severs the auth guard from every nested route.

Source: `src/app/_dashboard.tsx`

---

### MEDIUM — Forgetting to update AppLayout navigation after a URL change

If a nested directory structure results in a different URL than the original flat file, the sidebar link will point to a 404 until `AppLayout.tsx` is updated.

Check `navigation[]` and `settingsNavigation[]` in `src/components/layouts/AppLayout.tsx` whenever a migration changes a route's resolved path.

---

### MEDIUM — Adding flat files to a section that has already been nested

Once `src/app/_dashboard/settings/` exists, never create `src/app/_dashboard.settings.billing.tsx`. Mixing flat and nested files for the same section produces confusing route conflicts and defeats the purpose of the migration.

---

## Migration order (recommended)

Migrate highest-churn sections first so the improved structure pays off sooner:

1. `settings/` — one file today, easiest to validate
2. `applications/` — five files, high churn
3. `resumes/` — three files
4. Remaining single-file routes (`ai-agent`, `articles`, `calendar`, etc.) — migrate last or leave flat until a second file is needed

---

## Cross-references

- See also: `add-route/SKILL.md` — file naming conventions and `_dashboard` prefix rules.
- See also: TanStack Router devtools — always open during a migration to confirm route paths.
