---
name: getting-started
description: "Onboard to Tucaken: Yarn 4 setup, @/ path alias, local dev (admin-api runs live in K8s cluster via cdk-monitoring repo), BFF boundary (tucaken-app owns UI + server fns; admin-api owns DB + K8s jobs), TanStack devtools, and the canonical src/ directory map."
type: lifecycle
library: tucaken-app
library_version: initial-development
sources:
  - vite.config.ts
  - package.json
  - .nvmrc
  - src/app/
  - src/features/
  - src/server/
  - src/lib/api/query-keys.ts
  - src/lib/types/
  - src/lib/stores/
---

# getting-started

Onboarding checklist for Tucaken — a TanStack Start SaaS dashboard. Work through each section in order. Do not skip the BFF boundary section; the split between this repo and admin-api is the single most important mental model in the codebase.

---

## 1. Setup

- [ ] Confirm Node.js 22 is active (`node -v`). The `.nvmrc` pins the version — run `nvm use` if you use nvm.
- [ ] Enable Corepack so Yarn 4 is managed automatically:
  ```bash
  corepack enable
  ```
- [ ] Install dependencies:
  ```bash
  yarn install
  ```
- [ ] Start the dev server (runs on **port 5001**):
  ```bash
  yarn dev
  ```
- [ ] Verify the app loads at `http://localhost:5001`.

---

## 2. Path Aliases

- [ ] Understand the two aliases:
  - `@/` maps to `src/` — **always use this** in components, hooks, server functions, and route files.
  - `#/` maps to `src/` — only for ESM Node.js compatibility (e.g., in server entry points). Never use `#/` in component imports.
- [ ] Confirm: if you are writing a `.tsx` component, the import must use `@/`, not `#/` and not a relative path climbing to `src/`.

---

## 3. Environment Variables

- [ ] Create a `.env.local` file at the repo root for local overrides:
  ```bash
  # .env.local
  VITE_GITHUB_APP_SLUG=tucaken-admin
  ```
- [ ] Know the rule: only `VITE_` prefixed vars reach the browser. Never put secrets (API keys, tokens, database credentials) in `VITE_` vars — they are inlined into the JS bundle.
- [ ] Server-only secrets go in non-`VITE_` vars and are only accessible inside server functions (`src/server/`).

---

## 4. Local Dev Proxy and Admin-API

- [ ] Understand that **admin-api does not run locally**. It runs live in the Kubernetes cluster managed by the `cdk-monitoring` repo (`/Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring`).
- [ ] The Vite dev server proxies `/admin/api` to `http://localhost:3000` per `vite.config.ts`:
  ```typescript
  server: {
    proxy: {
      '/admin/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  ```
  This means during local development, requests to `/admin/api/*` are forwarded to the live cluster endpoint (port-forwarded or tunnelled to `localhost:3000`). You connect to the live cluster — you do not spin up a local copy of admin-api.
- [ ] Check the `cdk-monitoring` repo README for how to establish the cluster connection before running `yarn dev`.

---

## 5. BFF Boundary (Critical Mental Model)

This is the most important concept in the codebase. Read it fully.

- [ ] Understand the two-tier split:

  ```
  tucaken-app (this repo)
  ├── UI components    src/features/  src/components/
  ├── Routes           src/app/
  └── Server functions src/server/    ← BFF layer
          ↓ fetch() with Bearer JWT
  admin-api (Kubernetes cluster — cdk-monitoring repo)
  ├── Business logic
  ├── Database (RDS)
  └── K8s job dispatch (ingestion pipeline)
          ↓
  AWS Bedrock (AI inference, Knowledge Base)
  ```

- [ ] Confirm the boundary rule: **tucaken-app owns the UI and the BFF (server functions)**. **admin-api owns business logic, the database, and job dispatch**. tucaken-app never touches the database directly.
- [ ] Server functions live in `src/server/<domain>.ts` — not inside `src/features/`. Placing server functions inside a feature directory blurs this boundary.
- [ ] UI components call hooks; hooks call server functions; server functions call admin-api. Components never call admin-api directly.

---

## 6. src/ Directory Map

- [ ] Familiarise yourself with the layout before writing any new files:

  ```
  src/
  ├── app/           TanStack Router routes (_dashboard.*.tsx)
  ├── components/
  │   ├── ui/        Shared primitives: Button, DashboardPage, LinkCard, etc.
  │   └── layouts/   AppLayout, DashboardPage wrappers
  ├── features/      Feature modules: <domain>/components/ and <domain>/hooks/
  ├── server/        TanStack Start server functions — one file per domain
  ├── lib/
  │   ├── api/       Query key factory (query-keys.ts — extend adminKeys here)
  │   ├── auth/      JWT verification helpers
  │   ├── stores/    Zustand stores (UI state only — no server data)
  │   ├── types/     TypeScript interfaces (<domain>.types.ts)
  │   └── observability/  Faro RUM, analytics
  ├── hooks/         Shared hooks not tied to a single feature
  ├── contexts/      React contexts (ThemeContext, etc.)
  ├── types/         Global TypeScript types
  └── images/        Static assets
  ```

- [ ] Before creating any new component, run the audit:
  ```bash
  find src/components -name "*.tsx"
  ```
  If the component you need already exists in `src/components/ui/`, use it — do not create a duplicate.

---

## 7. Conventions Cheatsheet

- [ ] **Route files** follow the flat `_dashboard.<section>.<page>.tsx` naming convention inside `src/app/`. The `_dashboard.` prefix is required for routes that render inside the authenticated dashboard layout.
- [ ] **Server functions** are one file per domain: `src/server/<domain>.ts`.
- [ ] **Types** go in `src/lib/types/<domain>.types.ts`. Use `readonly` on all interface fields; use union string literals for status types, not TypeScript `enum`.
- [ ] **Query keys** extend the `adminKeys` object in `src/lib/api/query-keys.ts`. Never write inline query key arrays.
- [ ] **Commit format**: conventional commits — `feat(scope):`, `fix(scope):`, `chore:`. No emojis in commit messages.

---

## 8. TanStack Devtools

- [ ] In development, two devtools panels appear automatically:
  - **Bottom-left**: TanStack Router devtools — inspect matched routes, params, and pending navigation.
  - **Bottom-right**: TanStack Query devtools (ReactQueryDevtools) — inspect cache entries, query status, and trigger manual refetches.
- [ ] Use the Query devtools to verify query keys match `adminKeys.*` before assuming a fetch is broken.

---

## 9. CI Commands

- [ ] Know the four commands you will run before opening a PR:
  ```bash
  yarn lint       # ESLint
  yarn typecheck  # tsc --noEmit — no emitted files, type errors only
  yarn test       # Vitest (src/__tests__/**/*.test.ts, Node environment)
  yarn build      # Vite + esbuild SSR bundle — catches tree-shaking and SSR issues
  ```
- [ ] All four must pass on CI. Run `yarn typecheck` and `yarn build` locally — type errors that survive `lint` will block the pipeline.

---

## Cross-references

- See also: `add-feature-domain/SKILL.md` — full scaffold order for a new domain (types → server → query keys → hooks → components → route).
- See also: `add-route/SKILL.md` — `_dashboard.` prefix requirement, nav wiring, search params, DashboardPage usage.
- See also: `add-server-function/SKILL.md` — server function authoring patterns and BFF call conventions.
- See also: `add-query/SKILL.md` — polling, conditional refetch, and cache invalidation rules.
