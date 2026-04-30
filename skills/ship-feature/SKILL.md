---
name: ship-feature
description: End-to-end checklist for shipping a Tucaken feature: component reuse audit → server fn tests → typecheck → lint → vitest → smoke test → conventional commit → CI green → merge to main → ArgoCD deploy.
type: lifecycle
library: tucaken-app
library_version: initial-development
sources:
  - src/server/
  - src/features/
  - src/components/ui/
  - src/__tests__/server/
requires:
  - component-reuse-audit
  - add-server-function
  - security-review
---

# ship-feature

Sequential checklist for shipping a production-ready feature in the Tucaken SaaS app. Follow every step in order — each gate must pass before moving to the next.

---

## Step 1 — Component reuse audit (before writing any UI)

Search for existing primitives before creating anything new.

```bash
# List all shared UI components
find src/components -name "*.tsx" | sort

# Search for domain-specific patterns already in features
find src/features -name "*.tsx" | sort | grep -i "<pattern>"
```

Check `src/components/ui/` for these before building your own:

- `Button`
- `DashboardPage`
- `LinkCard`
- `GridListActions`
- `Field`
- `Tabs`

- [ ] Confirmed no duplicate UI will be created

---

## Step 2 — Implement using canonical file structure

Place every artifact in its designated layer:

```
src/server/<domain>.ts            # server functions (BFF handlers)
src/lib/types/<domain>.types.ts   # shared TypeScript types
src/lib/api/query-keys.ts         # add namespace for new domain
src/features/<domain>/            # React components + hooks
src/app/_dashboard.<page>.tsx     # thin route shell — no logic here
```

Rules:
- Route files (`_dashboard.*.tsx`) are thin shells — they import from `src/features/`, never contain business logic.
- Server functions are the **only** entry point to the admin-api from the browser.
- Types are shared between server and feature layers via `src/lib/types/`.

- [ ] Canonical structure followed

---

## Step 3 — Write Vitest tests for every new server function

Every new server function must have a corresponding test before the feature ships.

```bash
# Test file location
src/__tests__/server/<domain>.test.ts

# Run all tests
yarn test

# Run only this domain's tests
npx vitest run src/__tests__/server/<domain>.test.ts
```

Test environment: `node`. Required mocks:

- `createServerFn`
- `getCookie`
- `requireAuth`
- `fetch`

- [ ] Vitest tests written for all new server functions

---

## Step 4 — Type check

```bash
yarn typecheck
```

Must report **0 errors** before committing. TypeScript errors in server function types are the most common source of CI failures — catch them locally first.

- [ ] `yarn typecheck` passes with 0 errors

---

## Step 5 — Lint

```bash
yarn lint
```

ESLint with TypeScript rules. Fix all errors and warnings before moving on.

- [ ] `yarn lint` passes

---

## Step 6 — Security review

Audit every new or modified server function against this checklist:

- [ ] Every server function calls `await requireAuth()` as its **first line**
- [ ] Every POST handler has `.inputValidator(zodSchema)`
- [ ] All path parameters are wrapped with `encodeURIComponent()`
- [ ] No secret values use the `VITE_` prefix (they would be leaked to the client bundle)
- [ ] `securityHeadersMiddleware` is attached to every handler

---

## Step 7 — Conventional commit

Stage only the files that belong to this feature, then commit with a conventional message.

```bash
git add src/server/<domain>.ts src/features/<domain>/ src/lib/types/<domain>.types.ts
git commit -m "feat(<domain>): short imperative description"
```

**Commit type reference:**

| Type | When to use |
|---|---|
| `feat(scope):` | New user-facing feature |
| `fix(scope):` | Bug fix |
| `refactor(scope):` | Code restructure, no behavior change |
| `test(scope):` | Test additions or changes |
| `chore:` | Maintenance, dependency updates |
| `docs:` | Documentation only |

Format rule: `type(scope): description` — no capital letter, no period at end.

- [ ] Conventional commit message used

---

## Step 8 — Push and wait for CI

```bash
git push origin <branch>
```

CI pipeline sequence (all must be green before merge):

1. Lint
2. Typecheck
3. Test (Vitest)
4. Build
5. Docker build
6. Docker smoke test

- [ ] All CI checks green on branch

---

## Step 9 — Merge to main and verify deploy

Merging to `main` triggers the full deploy pipeline automatically:

1. Docker image built and pushed to ECR
2. Image URI written to SSM Parameter Store
3. ArgoCD syncs the new image to the cluster
4. Argo Rollouts pauses at the canary step
5. Promote command runs via SSM on the control-plane node
6. CloudFront `/admin/*` cache invalidated

Monitor ArgoCD to confirm the rollout completes successfully.

- [ ] Merged to main
- [ ] ArgoCD rollout promoted and healthy
- [ ] CloudFront invalidation confirmed

---

## Pre-merge summary

Complete this checklist before opening a pull request:

- [ ] Component reuse audit done — no duplicate UI created
- [ ] Canonical file structure followed
- [ ] Vitest tests written for all new server functions
- [ ] `yarn typecheck` passes (0 errors)
- [ ] `yarn lint` passes
- [ ] Security review complete (requireAuth, Zod, encodeURIComponent, no VITE_ secrets, securityHeadersMiddleware)
- [ ] Conventional commit message used
- [ ] CI pipeline green on branch

---

## Common mistakes

### HIGH: Committing without running typecheck

TypeScript errors in server function types are common and easy to miss locally — CI will catch them, but it wastes pipeline time and blocks the team.

**Fix:** Always run `yarn typecheck` before every commit.

### HIGH: Skipping server function tests

Untested server functions with wrong URLs or missing auth headers can reach production silently — there is no runtime error until a user hits the path.

**Fix:** Every new server function needs a test in `src/__tests__/server/` before the PR is opened.

### HIGH: Using a non-conventional commit message

Unstructured messages make the changelog unreadable and break automated tooling that parses commit history.

**Fix:** Always use `type(scope): description` format. When in doubt, use `feat` or `fix`.
