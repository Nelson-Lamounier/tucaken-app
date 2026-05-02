# Design: Remove /admin Basepath

**Date:** 2026-05-02
**Status:** Approved

## Context

`tucaken-app` originated as `start-admin`, an internal portfolio admin panel served under the `/admin` basepath. It has since migrated to a public-facing SaaS product on `tucaken.io`. The `/admin` prefix is now a UX liability — users see `tucaken.io/admin/` in the address bar and the home page only resolves at `/admin/`, not `/`.

Two symptoms visible today:
- `GET /` returns `307 → /admin/` (the server has no route at root)
- Styles and components not rendering correctly in production (patches.ts strips `/admin` from asset paths; once basepath is gone the strip must go too)

## Goal

- Home page at `/`
- Auth (sign-in + sign-up) at `/sign-in`
- OAuth callback at `/sign-in/callback`
- All dashboard routes at `/overview`, `/applications`, `/resumes`, etc. (protected, no prefix)
- No `/admin` string anywhere in user-visible URLs or server config

## Route Mapping

| Current | New | File | Auth |
|---|---|---|---|
| `/admin/` | `/` | `index.tsx` | Public |
| `/admin/auth` | `/sign-in` | `auth.tsx` → `sign-in.tsx` | Public |
| `/admin/auth/callback` | `/sign-in/callback` | `auth.callback.tsx` → `sign-in.callback.tsx` | Public |
| `/admin/login` | `/sign-in` | `login.tsx` (redirect) | Public |
| `/admin/overview` | `/overview` | `_dashboard.overview.tsx` | Protected |
| `/admin/applications/*` | `/applications/*` | `_dashboard.applications.*` | Protected |
| `/admin/resumes/*` | `/resumes/*` | `_dashboard.resumes.*` | Protected |
| `/admin/articles` | `/articles` | `_dashboard.articles.tsx` | Protected |
| `/admin/calendar` | `/calendar` | `_dashboard.calendar.tsx` | Protected |
| `/admin/comments` | `/comments` | `_dashboard.comments.tsx` | Protected |
| `/admin/reports` | `/reports` | `_dashboard.reports.tsx` | Protected |
| `/admin/settings/github` | `/settings/github` | `_dashboard.settings.github.tsx` | Protected |
| `/admin/ai-agent` | `/ai-agent` | `_dashboard.ai-agent.tsx` | Protected |

`_dashboard.*` filenames do not change. Auth protection logic in `_dashboard.tsx` is unchanged.

## Section 1 — Config and Asset Pipeline

### `src/router.tsx`
- Remove `basepath: '/admin'` (defaults to `'/'`)

### `vite.config.ts`
- `base: '/admin/'` → `base: '/'`
- Dev proxy rule: `/admin/api` → `/api`

### `src/app/__root.tsx`
- CSS path: `/admin/assets/styles.css` → `/assets/styles.css`
- `copyStylesFixedName` Vite plugin unchanged — still copies hashed CSS to fixed name, now at `/assets/styles.css`

### `src/server/patches.ts`
- Remove the `/admin` prefix-stripping logic (lines 99-100)
- Asset requests arrive as `/assets/*` and resolve directly to `dist/client/assets/*`

### `.github/workflows/deploy.yml`
- `VITE_ADMIN_BASE_PATH=/admin` → `VITE_ADMIN_BASE_PATH=` (empty)
- CloudFront invalidation path: `"/admin/*"` → `"/*"`

## Section 2 — Auth Flow and Cognito URIs

### File renames (`src/app/`)
- `auth.tsx` → `sign-in.tsx` (route: `/sign-in`)
- `auth.callback.tsx` → `sign-in.callback.tsx` (route: `/sign-in/callback`)

### Hardcoded redirect strings

| File | Old value | New value |
|---|---|---|
| `sign-in.tsx` | `window.location.href = '/admin/overview'` | `'/overview'` |
| `sign-in.callback.tsx` | `window.location.href = '/admin/'` | `'/overview'` |
| `login.tsx` | redirect to `/auth` | redirect to `/sign-in` |
| `src/components/layouts/AppLayout.tsx:147` | URL with `/admin` prefix | remove `/admin` prefix |
| `src/server/auth.ts:120` | `redirectUri: .../admin/auth/callback` | `.../sign-in/callback` |
| `src/server/auth.ts:338,340` | logout URI `/admin/login` | `/sign-in` |
| `src/server/auth.ts:388` | `redirectUri: .../admin/auth/callback` | `.../sign-in/callback` |

### Tests
- `src/__tests__/server/auth.test.ts:273,280` — update fallback URL strings

## Section 3 — Scripts and CI/CD

| File | Change |
|---|---|
| `scripts/setup-cognito-providers.ts:801` | callback URI → `/sign-in/callback` |
| `scripts/update-cognito-prod.ts:127,128` | callback → `/sign-in/callback`, logout → `/sign-in` |
| `scripts/local-dev.ts:13,14,296,328,335,346` | remove `/admin` prefix from localhost URLs |
| `.github/workflows/ci.yml:133,144-148` | smoke test health checks → `/sign-in` |

## Deploy Sequence (order matters)

1. **Update Cognito App Client** — add `/sign-in/callback` as allowed callback URI (AWS console or `scripts/update-cognito-prod.ts`). Do NOT remove the old `/admin/auth/callback` yet — keep both during the deploy window.
2. **Push code** — CI builds with `base: '/'`, new image pushed to ECR.
3. **ArgoCD Image Updater** picks up new tag → Blue/Green Rollout deploys new pod.
4. **Verify** — `GET /` returns 200, `GET /sign-in` returns 200, OAuth sign-in completes.
5. **Remove old Cognito URI** — clean up `/admin/auth/callback` from the App Client allowed list.

## What Does NOT Change

- `_dashboard.*` filenames — only their effective URLs change (basepath removed)
- `_dashboard.tsx` auth guard logic — identical
- All `/api/admin/*` calls in server functions — these target the `admin-api` backend service, not the frontend basepath
- `ThemeContext.tsx` legacy key migration — cosmetic, unrelated
