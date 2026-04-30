---
name: restructure-module
description: Move or rename Tucaken files and directories without breaking @/ imports, TanStack Router route derivation, AppLayout navigation, or CI. Covers the post-move verification sequence: tsc --noEmit → vitest run → nav update.
type: core
library: tucaken-app
library_version: initial-development
sources:
  - vite.config.ts
  - tsconfig.json
  - src/components/layouts/AppLayout.tsx
  - src/app/_dashboard.settings.github.tsx
  - .github/workflows/ci.yml
requires:
  - maintainability-review
---

# restructure-module

Move or rename Tucaken files and directories without breaking `@/` imports, TanStack Router route derivation, AppLayout navigation, or CI.

## Setup

- Path alias: `@/` maps to `src/` — configured in both `vite.config.ts` and `tsconfig.json`.
- Routes live in `src/app/`. TanStack Router derives route paths from **filenames**, not file content.
- AppLayout navigation is hardcoded in `src/components/layouts/AppLayout.tsx` (`navigation[]` and `settingsNavigation[]`).
- CI gates: `lint` → `typecheck` → `test` → `build`. All four must pass.

---

## Core Patterns

### 1. Moving a shared component from a feature to `src/components/ui/`

```bash
# 1. Move the file
mv src/features/github/components/GitHubRepoChip.tsx src/components/ui/GitHubRepoChip.tsx

# 2. Find all consumers before touching imports
grep -r "features/github/components/GitHubRepoChip" src/ --include="*.tsx" --include="*.ts"

# 3. Update each import
# Before: import { GitHubRepoChip } from '@/features/github/components/GitHubRepoChip'
# After:  import { GitHubRepoChip } from '@/components/ui/GitHubRepoChip'

# 4. Verify
yarn typecheck
yarn test
```

### 2. Renaming a feature directory

```bash
# 1. Rename the directory
mv src/features/applications src/features/jobs

# 2. Find all @/ imports referencing the old path (check server/ and lib/types/ too)
grep -r "@/features/applications" src/ --include="*.tsx" --include="*.ts"

# 3. Update all references

# 4. Run the full verification sequence (see Pattern 5)
```

### 3. Moving a route file (URL change)

The route URL is derived from the filename. Moving a file silently changes the URL.

```bash
# Moving _dashboard.applications.github.tsx → /applications/github is GONE
# Users hitting the old URL see the 404 handler (_dashboard.$.tsx)

# Delete old route file (old URL gone):
rm src/app/_dashboard.applications.github.tsx

# Create file at the new location (new URL active after dev server restart):
# e.g. src/app/_dashboard.settings.github.tsx → /settings/github

# Update AppLayout navigation to match the new href (see Pattern 4)
```

Verify the derived URL with TanStack Router devtools after restarting the dev server.

### 4. Updating AppLayout navigation after a route move

Always check both arrays in `src/components/layouts/AppLayout.tsx` after any route rename.

```typescript
// src/components/layouts/AppLayout.tsx

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Billing',   href: '/billing', icon: CreditCardIcon }, // ← update href here
] as const

const settingsNavigation = [
  { name: 'GitHub', href: '/settings/github', icon: Github }, // ← or here
] as const
```

Primary nav icons come from `@heroicons/react/24/outline`. Settings nav icons come from `lucide-react`. Match the existing import pattern.

### 5. Splitting a large route file into co-located feature components

```bash
# Before: _dashboard.applications.$slug.tsx (500+ lines, everything inline)
# After:  thin route file + extracted components under src/features/

# 1. Create the feature components directory
mkdir -p src/features/applications/components

# 2. Extract each section component to its own file
# e.g. src/features/applications/components/ApplicationDetail.tsx

# 3. Update the route file to delegate rendering
```

Resulting thin route:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ApplicationDetail } from '@/features/applications/components/ApplicationDetail'

export const Route = createFileRoute('/_dashboard/applications/$slug')({
  component: () => <ApplicationDetail />,
})
```

### 6. Post-restructure verification sequence (run all four, in order)

```bash
yarn typecheck   # 1. Catches broken @/ imports and type errors
yarn lint        # 2. Catches unused imports and style violations
yarn test        # 3. Catches broken Vitest import paths
yarn build       # 4. Catches SSR/client import differences and bundle errors
```

All four are CI gates (`.github/workflows/ci.yml`). Skipping any step risks a broken CI run even when local TypeScript passes.

---

## Common Mistakes

### HIGH — Moving a file without updating all `@/` imports

**Wrong:** Move the file and assume the IDE has found every reference.

**Correct:** Search first, then move.

```bash
# Search before moving:
grep -r "@/features/github/components/GitHubRepoChip" src/ --include="*.tsx" --include="*.ts"

# Move:
mv src/features/github/components/GitHubRepoChip.tsx src/components/ui/GitHubRepoChip.tsx

# Update every hit from the grep output, then:
yarn typecheck
```

The `@/` alias is resolved at build time by Vite and at type-check time by TypeScript. An unreachable path compiles silently until `tsc --noEmit` or the build runs.

Source: `vite.config.ts`, `tsconfig.json`

---

### HIGH — Renaming a route file without updating AppLayout navigation

**Wrong:** Rename `_dashboard.settings.github.tsx` → the URL changes, but `href: '/settings/github'` in AppLayout still points to the old path. The sidebar link silently 404s.

**Correct:** After any route rename, open `src/components/layouts/AppLayout.tsx` and update both `navigation[]` and `settingsNavigation[]`.

```typescript
// Before rename: { name: 'GitHub', href: '/settings/github', icon: Github }
// After rename:  { name: 'GitHub', href: '/integrations/github', icon: Github }
```

Source: `src/components/layouts/AppLayout.tsx`

---

### HIGH — Not running the full verification sequence after a restructure

**Wrong:** Running only `yarn typecheck` — misses Vitest import paths and SSR/client split differences caught by the build step.

**Correct:** Always run all four in sequence:

```bash
yarn typecheck && yarn lint && yarn test && yarn build
```

TypeScript can pass while Vitest fails because test files use `@/` imports resolved by a separate Vitest alias config. The build step catches SSR vs. client import differences that neither typecheck nor test surface.

Source: `.github/workflows/ci.yml`

---

## Cross-references

- See also: `maintainability-review/SKILL.md` — review structure before deciding what to move.
- See also: `add-route/SKILL.md` — filename conventions and AppLayout wiring for new routes.
