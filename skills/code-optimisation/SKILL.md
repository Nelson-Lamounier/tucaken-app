---
name: code-optimisation
description: Fix render inefficiencies, SSR hydration issues, and bundle bloat in Tucaken. Covers window/localStorage SSR guards, React 19 memoisation, lazy-loaded devtools pattern, Tailwind v4 SSR build constraints, and Motion for React willChange + independent transforms.
type: core
library: tucaken-app
library_version: initial-development
sources:
  - src/app/__root.tsx
  - vite.config.ts
  - .claude/rules/motion-react.md
---

# Code Optimisation

## Overview

Tucaken runs on TanStack Start with SSR enabled. The same component tree that renders in the browser is also rendered on the server — where `window`, `document`, and `localStorage` do not exist. Any code that touches browser globals at module or render level will throw a `ReferenceError` on the server and crash the SSR pass.

Beyond SSR safety, optimisation work in this codebase covers three axes:

- **Bundle size** — devtools and other dev-only packages must never ship in production.
- **Render cost** — expensive derived values in React 19 components must be memoised.
- **Animation performance** — Motion for React animations must use hardware-accelerated properties with correct `willChange` declarations and independent transforms.

**Tension note:** The same code that works in the browser may crash on the server. Always validate SSR correctness by inspecting the server-side render output, not just browser behaviour. A page that hydrates correctly in the browser can still throw on the server during the initial render pass.

**See also:** `component-reuse-audit/SKILL.md` — Motion import rules and `willChange` patterns.

---

## Setup

### Step 1 — Identify the failure surface

```bash
# Find all browser-global access outside useEffect / event handlers
grep -rn "localStorage\|sessionStorage\|window\.\|document\." src/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "useEffect\|__root"

# Find framer-motion imports (wrong package — crashes at runtime)
grep -rn "from 'framer-motion'\|from \"framer-motion\"" src/

# Find unconditional devtools imports (included in prod bundle)
grep -rn "RouterDevtools\|ReactQueryDevtools" src/ \
  | grep -v "React.lazy\|process.env"
```

### Step 2 — Confirm Tailwind build configuration

```bash
grep -n "tailwindcss\|isSsrBuild" vite.config.ts
```

Tailwind must only appear in the client build. If `tailwindcss()` is not guarded by `!isSsrBuild`, SSR builds will attempt to process CSS and fail.

---

## Core Patterns

### SSR Safety — Anti-Flash Script

Pre-paint reads of `localStorage` (e.g. for theme) must run as an inline `<script>` injected into the server-rendered HTML, not in a React render or module scope. This runs synchronously before the browser paints, eliminating flash.

The script is defined as a constant string in `src/app/__root.tsx`:

```typescript
// src/app/__root.tsx

const ANTI_FLASH_SCRIPT = `
(function() {
  var stored = null;
  try { stored = localStorage.getItem('start-admin-theme'); } catch (e) {}
  var isDark = stored === null ? true : stored !== 'light';
  if (isDark) document.documentElement.classList.add('dark');
})();
`
```

It is injected in `RootDocument` via a `<script>` tag with the `__html` property set to `ANTI_FLASH_SCRIPT`. Because this string is a static constant defined in the codebase (not user input), there is no XSS risk.

All other browser-SDK initialisation belongs inside `useEffect`:

```typescript
useEffect(() => {
  initialiseFaroAdmin() // browser SDK — safe; runs client-side only
}, [])
```

---

### Bundle Optimisation — Lazy-Loaded Devtools

Devtools packages must never appear in the production bundle. The correct pattern uses `React.lazy` with a `process.env.NODE_ENV` guard so the dynamic import is tree-shaken out of production builds entirely.

```typescript
// src/app/__root.tsx

const TanStackDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : React.lazy(() =>
        Promise.all([
          import('@tanstack/react-router-devtools'),
          import('@tanstack/react-query-devtools'),
        ]).then(([router, query]) => ({
          default: () => (
            <>
              <router.TanStackRouterDevtools position="bottom-left" />
              <query.ReactQueryDevtools />
            </>
          ),
        })),
      )

// Always wrap in Suspense:
<Suspense fallback={null}>
  <TanStackDevtools />
</Suspense>
```

---

### Tailwind v4 SSR Build Constraint

Tailwind CSS v4 runs a client-only PostCSS build. It must be skipped during the SSR build pass, otherwise the build fails. The `copyStylesFixedName` plugin re-exports the hashed CSS under a stable name so the SSR HTML can reference it without a hash mismatch.

```typescript
// vite.config.ts
plugins: [
  !isSsrBuild && tailwindcss(), // skipped during SSR build
  tanstackStart(...),
  viteReact(),
]
```

Never move `tailwindcss()` outside the `!isSsrBuild` guard.

---

### Motion for React — Correct Imports

The package was renamed from `framer-motion` to `motion/react`. The old package is not installed — importing from it crashes at runtime.

```typescript
// Client component ('use client' or bundled client-side):
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react'

// Server component ONLY:
import * as motion from 'motion/react-client'

// animate() function in a React file:
import { animate } from 'motion/react'

// NEVER:
import { motion } from 'framer-motion' // wrong package — not installed
```

---

### Motion for React — willChange and Independent Transforms

Add `willChange` for any hardware-accelerated animated property. Only these values are permitted in `willChange`: `transform`, `opacity`, `clipPath`, `filter`.

```tsx
// Single animated transform:
<motion.div
  animate={{ x: 100 }}
  style={{ willChange: 'transform' }}
/>

// Composable transforms — use independent props, not a compound transform string:
<motion.div
  animate={{ x: 100 }}         // independent transform
  whileHover={{ scale: 1.05 }} // composable with x
  style={{ willChange: 'transform' }}
/>

// Multiple animated properties:
<motion.div
  animate={{ x: 100, opacity: 1 }}
  style={{ willChange: 'transform, opacity' }}
/>
```

Always prefer independent transforms (`x`, `y`, `scaleX`, `scale`) over compound `transform` strings when transforms might compose or compete.

---

### React 19 Memoisation — Derived Lists

Expensive set lookups and filtered arrays must be wrapped in `useMemo`. Without this, every render recalculates the full list even when the underlying data has not changed.

```tsx
// Set for O(1) membership checks:
const connectedSet = useMemo(
  () => new Set((connectedRepos ?? []).map((r) => r.repoFullName)),
  [connectedRepos],
)

// Filtered list — recomputes only when source data or search term changes:
const filtered = useMemo(() => {
  const q = search.trim().toLowerCase()
  return (accessibleRepos ?? []).filter((r) =>
    q === '' || r.fullName.toLowerCase().includes(q),
  )
}, [accessibleRepos, search])
```

---

## Common Mistakes

### CRITICAL — Importing Motion from `framer-motion`

```tsx
// Wrong — not installed, crashes at runtime
import { motion } from 'framer-motion'

// Correct
import { motion } from 'motion/react'
```

Source: `.claude/rules/motion-react.md`

---

### HIGH — Accessing `window` or `localStorage` at Render or Module Level

```tsx
// Wrong — throws ReferenceError on the server
const theme = localStorage.getItem('start-admin-theme') // module level

function MyComponent() {
  const width = window.innerWidth // render level — crashes during SSR
  ...
}

// Correct — browser globals inside useEffect only
useEffect(() => {
  const theme = localStorage.getItem('start-admin-theme')
  const width = window.innerWidth
}, [])

// Correct — pre-paint reads via an inline script constant injected in RootDocument
// See: ANTI_FLASH_SCRIPT in src/app/__root.tsx
```

Mechanism: `window` is `undefined` on the server. The error surfaces during the SSR render pass, not in the browser.

Source: `src/app/__root.tsx` — ANTI_FLASH_SCRIPT pattern

---

### HIGH — Unconditional Devtools Import (Included in Prod Bundle)

```typescript
// Wrong — included in production bundle, increases initial load
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

// Correct — tree-shaken from production build via React.lazy + NODE_ENV guard
const TanStackDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : React.lazy(() => import('@tanstack/react-router-devtools').then(...))
```

Source: `src/app/__root.tsx`

---

### HIGH — Compound Transform Instead of Independent Transforms

```tsx
// Wrong — not composable with whileHover scale, layout animations, or style transforms
<motion.div animate={{ transform: 'translateX(100px) scale(1.05)' }} />

// Correct — composable independent transforms
<motion.div
  animate={{ x: 100 }}
  whileHover={{ scale: 1.05 }}
  style={{ willChange: 'transform' }}
/>
```

Source: `.claude/rules/motion-react.md`

---

### MEDIUM — Missing `willChange` on Animated Transforms

```tsx
// Wrong — GPU layer not promoted, animation may jank
<motion.div animate={{ x: 100 }} />

// Correct
<motion.div animate={{ x: 100 }} style={{ willChange: 'transform' }} />
```

Only add values that are actually animated. Do not add `willChange: 'transform, opacity, clipPath, filter'` speculatively — this promotes the layer unnecessarily.

Source: `.claude/rules/motion-react.md`

---

### MEDIUM — Tailwind in SSR Build

```typescript
// Wrong — tailwindcss() runs during SSR build, build fails
plugins: [tailwindcss(), tanstackStart(...), viteReact()]

// Correct
plugins: [!isSsrBuild && tailwindcss(), tanstackStart(...), viteReact()]
```

Source: `vite.config.ts`

---

## References

- SSR safety and anti-flash pattern: `src/app/__root.tsx`
- Tailwind build constraint: `vite.config.ts`
- Motion for React rules: `.claude/rules/motion-react.md`
- See also: `component-reuse-audit/SKILL.md` — Motion import rules and `willChange` patterns
