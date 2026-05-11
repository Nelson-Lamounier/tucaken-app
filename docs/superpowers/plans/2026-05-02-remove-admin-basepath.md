# Remove /admin Basepath Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `/admin` basepath so the app serves at `/`, the auth page serves at `/sign-in`, and all dashboard routes lose the `/admin` prefix.

**Architecture:** Atomic refactor across config, route files, server functions, scripts, and CI/CD in a single coordinated change. The TanStack Router `basepath` and Vite `base` config drive the URL structure; all hardcoded `/admin/...` strings in app code, server functions, and infrastructure scripts must be updated in lock-step.

**Tech Stack:** TanStack Start v1.167.50, TanStack Router (file-based routing), Vite, Node.js HTTP server (patches.ts), AWS Cognito, GitHub Actions, Kubernetes (kubernetes-bootstrap repo)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/router.tsx` | Modify | Remove `basepath: '/admin'` |
| `vite.config.ts` | Modify | `base: '/admin/'` → `base: '/'`; proxy key `/admin/api` → `/api`; update comment |
| `src/app/__root.tsx` | Modify | CSS path `/admin/assets/styles.css` → `/assets/styles.css` |
| `src/server/patches.ts` | Modify | Remove `/admin` strip from `tryServeStatic`; update comments |
| `src/app/auth.tsx` | Rename+Modify | → `sign-in.tsx`; route `/auth` → `/sign-in`; redirects `/admin/overview` → `/overview` |
| `src/app/auth.callback.tsx` | Rename+Modify | → `sign-in.callback.tsx`; route `/auth/callback` → `/sign-in/callback`; redirect `/admin/` → `/overview` |
| `src/app/login.tsx` | Modify | Redirect target `/auth` → `/sign-in` |
| `src/app/_dashboard.tsx` | Modify | Auth redirect target `/auth` → `/sign-in` (×2) |
| `src/features/home/HomePage.tsx` | Modify | `Link to` and `navigate` `/auth` → `/sign-in` (×2) |
| `src/features/home/sections/HeroSection.tsx` | Modify | `navigate` `/auth` → `/sign-in` (×2) |
| `src/features/home/sections/Sections.tsx` | Modify | `navigate` `/auth` → `/sign-in` |
| `src/components/layouts/AppLayout.tsx` | Modify | Sign-out fallback `/admin/auth` → `/sign-in` |
| `src/server/auth.ts` | Modify | Cognito `redirectUri` `/admin/auth/callback` → `/sign-in/callback` (×2); logout `/admin/login` → `/sign-in` (×2) |
| `src/__tests__/server/auth.test.ts` | Modify | Fallback assertion `/admin/login` → `/sign-in` |
| `scripts/setup-cognito-providers.ts` | Modify | Callback URI `/admin/auth/callback` → `/sign-in/callback` |
| `scripts/update-cognito-prod.ts` | Modify | `callbackUrl` and `logoutUrl` helper returns |
| `scripts/local-dev.ts` | Modify | Log message URLs `/admin/` → `/` |
| `.github/workflows/deploy.yml` | Modify | Remove `VITE_ADMIN_BASE_PATH=/admin`; job name; CloudFront path `/admin/*` → `/*` |
| `.github/workflows/ci.yml` | Modify | Health check URLs `/admin/` → `/sign-in` |
| `../kubernetes-bootstrap/charts/tucaken-app/chart/values.yaml` | Modify | Probe path `/admin/auth` → `/sign-in` |

---

## Task 1: Router and Vite base config

**Files:**
- Modify: `src/router.tsx:12`
- Modify: `vite.config.ts:14,47,55`

- [ ] **Step 1: Remove basepath from router**

  Edit `src/router.tsx` — delete line 12 entirely:
  ```ts
  // REMOVE this line:
  basepath: '/admin',
  ```
  Result:
  ```ts
  export function getRouter() {
    const router = createTanStackRouter({
      routeTree,
      context: {
        auth: { user: null },
      } as RouterContext,
      scrollRestoration: true,
      defaultPreload: 'intent',
      defaultPreloadStaleTime: 0,
    })
    return router
  }
  ```

- [ ] **Step 2: Update Vite base and dev proxy**

  Edit `vite.config.ts`:

  Line 14 (comment) — update to reflect new path:
  ```ts
  // After the client build, copy the hashed stylesheet to a fixed name so the
  // SSR bundle and browser always agree on the URL (/assets/styles.css).
  ```

  Line 47 — change base:
  ```ts
  base: '/',
  ```

  Lines 53–59 — change proxy key:
  ```ts
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  ```

- [ ] **Step 3: Update CSS path in __root.tsx**

  Edit `src/app/__root.tsx` line 8:
  ```ts
  const appCss = `${import.meta.env.BASE_URL ?? '/'}assets/styles.css`
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
  git add src/router.tsx vite.config.ts src/app/__root.tsx
  git commit -m "feat: remove /admin basepath from router and vite config"
  ```

---

## Task 2: Fix patches.ts static asset server

**Files:**
- Modify: `src/server/patches.ts:1-14,63-64,90-101`

- [ ] **Step 1: Update file docblock (lines 1–14)**

  Replace the top comment block:
  ```ts
  /**
   * Production HTTP server for TanStack Start.
   *
   * Responsibilities:
   *   1. Fast-path static file serving: maps /assets/* → dist/client/assets/*
   *      before any request reaches the SSR handler.
   *   2. SSR delegation: converts Node.js IncomingMessage → Web Request and
   *      pipes the Web Response back to the Node.js ServerResponse.
   */
  ```

- [ ] **Step 2: Update static asset config comment (lines 59–64)**

  Replace:
  ```ts
  // ---------------------------------------------------------------------------
  // Static asset config
  // ---------------------------------------------------------------------------
  // Vite outputs client assets to dist/client/. Asset URLs are /assets/<hash>.<ext>.
  const CLIENT_DIR = join(__dirname, 'dist', 'client');
  ```

- [ ] **Step 3: Update tryServeStatic docblock and remove strip (lines 87–101)**

  Replace the URL mapping comment and the strip line:
  ```ts
  /**
   * Attempts to serve a static file from `dist/client/`.
   *
   * URL mapping:
   *   /assets/styles-BaHLhT7v.css  →  dist/client/assets/styles-BaHLhT7v.css
   *   /assets/main-BPTnT1y8.js     →  dist/client/assets/main-BPTnT1y8.js
   *
   * @param urlPath - Pathname portion of the request URL (no query string).
   * @param res     - Node.js HTTP server response.
   * @returns `true` if the response was sent; `false` to fall through to SSR.
   */
  function tryServeStatic(urlPath: string, res: ServerResponse): boolean {
    // Decode percent-encoded characters (e.g. spaces, non-ASCII filenames).
    let stripped = urlPath;
    try {
      stripped = decodeURIComponent(stripped);
    } catch {
      return false;
    }
  ```

  The variable is still called `stripped` for minimal diff — it's just no longer stripping a prefix.

- [ ] **Step 4: Commit**
  ```bash
  git add src/server/patches.ts
  git commit -m "feat: remove /admin prefix strip from static asset server"
  ```

---

## Task 3: Rename auth route files and update route strings

**Files:**
- Rename+Modify: `src/app/auth.tsx` → `src/app/sign-in.tsx`
- Rename+Modify: `src/app/auth.callback.tsx` → `src/app/sign-in.callback.tsx`

TanStack Router derives route paths from filenames. Renaming is the mechanism — the `createFileRoute` string inside must match.

- [ ] **Step 1: Create sign-in.tsx (replaces auth.tsx)**

  Create `src/app/sign-in.tsx` with full content:
  ```tsx
  "use client"
  import { createFileRoute } from '@tanstack/react-router'
  import { EnergeticAuthShell } from '../features/auth/components/EnergeticAuthShell'
  import { getLoginUrlFn, signInWithPasswordFn, respondToMfaChallengeFn, forgotPasswordFn, confirmForgotPasswordFn } from '../server/auth'

  export const Route = createFileRoute('/sign-in')({
    component: AuthPage,
  })

  function AuthPage() {
    const goOAuth = async (provider: 'Google' | 'GitHub') => {
      const url = await getLoginUrlFn({ data: { provider } })
      globalThis.window.location.href = url
    }

    return (
      <EnergeticAuthShell
        onGoogle={() => goOAuth('Google')}
        onGithub={() => goOAuth('GitHub')}
        onSignIn={async (v) => {
          const result = await signInWithPasswordFn({ data: v })
          if (!result.success) return 'otp'
          globalThis.window.location.href = '/overview'
        }}
        onOtp={async (code) => {
          await respondToMfaChallengeFn({ data: { code } })
          globalThis.window.location.href = '/overview'
        }}
        onRequestPasswordCode={async (email) => {
          await forgotPasswordFn({ data: { email } })
        }}
        onConfirmPassword={async (email, code, newPassword) => {
          await confirmForgotPasswordFn({ data: { email, code, newPassword } })
        }}
        onSignUp={async () => {
          const url = await getLoginUrlFn({ data: {} })
          globalThis.window.location.href = url
        }}
      />
    )
  }
  ```

- [ ] **Step 2: Create sign-in.callback.tsx (replaces auth.callback.tsx)**

  Create `src/app/sign-in.callback.tsx` with full content:
  ```tsx
  import { createFileRoute, redirect } from '@tanstack/react-router'
  import { z } from 'zod'
  import { handleAuthCallbackFn } from '../server/auth'

  const callbackSearchSchema = z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
  })

  export const Route = createFileRoute('/sign-in/callback')({
    validateSearch: callbackSearchSchema,
    beforeLoad: async ({ search }) => {
      if (search.error) {
        throw redirect({ to: '/sign-in' })
      }

      if (!search.code) {
        throw redirect({ to: '/sign-in' })
      }

      if (!search.state) {
        throw redirect({ to: '/sign-in' })
      }

      try {
        await handleAuthCallbackFn({ data: { code: search.code, state: search.state } })
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          ('status' in err || 'redirect' in err || 'name' in err)
        ) {
          const errObj = err as Record<string, unknown>
          if (
            errObj.status === 307 ||
            errObj.status === 302 ||
            errObj.name === 'RedirectError' ||
            'redirect' in errObj
          ) {
            throw err
          }
        }
        throw redirect({ to: '/sign-in' })
      }

      if (typeof window !== 'undefined') {
        globalThis.window.location.href = '/overview'
        await new Promise<void>(() => {})
      }
      throw redirect({ to: '/overview' })
    },
    component: () => (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-zinc-400">Authenticating...</p>
        </div>
      </div>
    ),
  })
  ```

- [ ] **Step 3: Delete old auth route files**
  ```bash
  git rm src/app/auth.tsx src/app/auth.callback.tsx
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add src/app/sign-in.tsx src/app/sign-in.callback.tsx
  git commit -m "feat: rename auth routes to /sign-in and /sign-in/callback"
  ```

---

## Task 4: Update all /auth navigation references

Every `to: '/auth'` and `Link to="/auth"` in app code must become `/sign-in`.

**Files:**
- Modify: `src/app/login.tsx:5`
- Modify: `src/app/_dashboard.tsx:11,26`
- Modify: `src/features/home/HomePage.tsx:31,34`
- Modify: `src/features/home/sections/HeroSection.tsx:111,112`
- Modify: `src/features/home/sections/Sections.tsx:193`

- [ ] **Step 1: Update login.tsx**

  `src/app/login.tsx` full file:
  ```ts
  import { createFileRoute, redirect } from '@tanstack/react-router'

  export const Route = createFileRoute('/login')({
    beforeLoad: () => {
      throw redirect({ to: '/sign-in' })
    },
  })
  ```

- [ ] **Step 2: Update _dashboard.tsx auth redirects**

  Edit `src/app/_dashboard.tsx` lines 11 and 26 — change both `to: '/auth'` to `to: '/sign-in'`:
  ```ts
  // Gate 1: valid Cognito session
  if (!context.auth.user) {
    throw redirect({
      to: '/sign-in',
      search: { callbackUrl: location.href },
    })
  }

  // Gate 2: DB provisioning
  try {
    me = await getMeFn()
  } catch {
    throw redirect({
      to: '/sign-in',
      search: { callbackUrl: location.href },
    })
  }
  ```

- [ ] **Step 3: Update HomePage.tsx**

  `src/features/home/HomePage.tsx` — find and replace both `/auth` occurrences.

  Line 31 (Link):
  ```tsx
  <Link to="/sign-in" className="hidden font-mono text-xs text-zinc-500 hover:text-zinc-900 md:block">
  ```
  Line 34 (MagneticButton):
  ```tsx
  <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>Try free</MagneticButton>
  ```

- [ ] **Step 4: Update HeroSection.tsx**

  `src/features/home/sections/HeroSection.tsx` lines 111–112:
  ```tsx
  <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>⌥ {hero.primaryCta}</MagneticButton>
  <MagneticButton onClick={() => navigate({ to: '/sign-in' })}>{hero.secondaryCta}</MagneticButton>
  ```

- [ ] **Step 5: Update Sections.tsx**

  `src/features/home/sections/Sections.tsx` line 193:
  ```tsx
  <MagneticButton primary={p.hl} className="mt-7 w-full" onClick={() => navigate({ to: '/sign-in' })}>
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add src/app/login.tsx src/app/_dashboard.tsx \
    src/features/home/HomePage.tsx \
    src/features/home/sections/HeroSection.tsx \
    src/features/home/sections/Sections.tsx
  git commit -m "feat: update all /auth navigation targets to /sign-in"
  ```

---

## Task 5: Update AppLayout.tsx sign-out fallback

**Files:**
- Modify: `src/components/layouts/AppLayout.tsx` (~line 147)

- [ ] **Step 1: Update sign-out fallback URL**

  Find the `handleSignOut` function. Change:
  ```ts
  let targetUrl = "/admin/auth";
  ```
  To:
  ```ts
  let targetUrl = "/sign-in";
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/components/layouts/AppLayout.tsx
  git commit -m "feat: update sign-out fallback URL to /sign-in"
  ```

---

## Task 6: Update server/auth.ts Cognito URIs

**Files:**
- Modify: `src/server/auth.ts:120,338,340,388`

- [ ] **Step 1: Update getLoginUrlFn redirectUri (line 120)**

  Change:
  ```ts
  const redirectUri = `${scheme}://${host}/admin/auth/callback`
  ```
  To:
  ```ts
  const redirectUri = `${scheme}://${host}/sign-in/callback`
  ```

- [ ] **Step 2: Update logoutFn URI (lines 338, 340)**

  Change:
  ```ts
  const logoutUri = `${scheme}://${host}/admin/login`
  let logoutUrl = '/admin/login'
  ```
  To:
  ```ts
  const logoutUri = `${scheme}://${host}/sign-in`
  let logoutUrl = '/sign-in'
  ```

- [ ] **Step 3: Update handleAuthCallbackFn redirectUri (line 388)**

  Change:
  ```ts
  const redirectUri = `${scheme}://${host}/admin/auth/callback`
  ```
  To:
  ```ts
  const redirectUri = `${scheme}://${host}/sign-in/callback`
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add src/server/auth.ts
  git commit -m "feat: update Cognito redirect and logout URIs to /sign-in paths"
  ```

---

## Task 7: Update auth tests

**Files:**
- Modify: `src/__tests__/server/auth.test.ts:273,280`

- [ ] **Step 1: Update fallback logout URL assertion**

  Line 273 — change test description:
  ```ts
  it('should fall back to /sign-in when Cognito is not configured', async () => {
  ```

  Line 280 — change assertion:
  ```ts
  expect(result.logoutUrl).toBe('/sign-in')
  ```

- [ ] **Step 2: Run tests to confirm they pass**
  ```bash
  cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
  yarn test
  ```
  Expected: all tests pass including the updated logout test.

- [ ] **Step 3: Commit**
  ```bash
  git add src/__tests__/server/auth.test.ts
  git commit -m "test: update logout fallback URL assertion to /sign-in"
  ```

---

## Task 8: Update scripts

**Files:**
- Modify: `scripts/setup-cognito-providers.ts:801`
- Modify: `scripts/update-cognito-prod.ts:127,128`
- Modify: `scripts/local-dev.ts` (log messages only)

- [ ] **Step 1: Update setup-cognito-providers.ts (line 801)**

  Change:
  ```ts
  const redirectUri = encodeURIComponent(`${opts.appUrl}/admin/auth/callback`)
  ```
  To:
  ```ts
  const redirectUri = encodeURIComponent(`${opts.appUrl}/sign-in/callback`)
  ```

- [ ] **Step 2: Update update-cognito-prod.ts (lines 127–128)**

  Change both helper functions:
  ```ts
  function callbackUrl(base: string) { return `${base}/sign-in/callback` }
  function logoutUrl(base: string)   { return `${base}/sign-in` }
  ```

- [ ] **Step 3: Update local-dev.ts log messages**

  There are several `log.ok(... /admin/ ...)` strings. Find all three occurrences and update:

  Around line 335:
  ```ts
  log.ok(`${APP_CONTAINER} started → http://localhost:${APP_PORT}/`)
  ```
  Around line 340 (health check):
  ```ts
  log.ok(`tucaken-app healthy → http://localhost:${APP_PORT}/`)
  ```
  Around line 346 (summary console.log):
  ```ts
  console.log(`  ${C.bold}tucaken-app${C.reset}   http://localhost:${APP_PORT}/`)
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add scripts/setup-cognito-providers.ts scripts/update-cognito-prod.ts scripts/local-dev.ts
  git commit -m "feat: update Cognito script callback/logout URLs to /sign-in paths"
  ```

---

## Task 9: Update CI/CD workflows

**Files:**
- Modify: `.github/workflows/deploy.yml:84,257,292`
- Modify: `.github/workflows/ci.yml:133,144-148`

- [ ] **Step 1: Update deploy.yml build args (line 84)**

  Remove the `VITE_ADMIN_BASE_PATH` line entirely from the `build-args` block:
  ```yaml
  build-args: |
    NODE_ENV=production
  ```
  (The line `VITE_ADMIN_BASE_PATH=/admin` is deleted.)

- [ ] **Step 2: Update deploy.yml job name (line 257)**

  Change:
  ```yaml
  name: Invalidate CloudFront /admin/*
  ```
  To:
  ```yaml
  name: Invalidate CloudFront cache
  ```

- [ ] **Step 3: Update deploy.yml CloudFront invalidation path (line 292)**

  Change:
  ```yaml
  --paths "/admin/*" \
  ```
  To:
  ```yaml
  --paths "/*" \
  ```

- [ ] **Step 4: Update ci.yml health checks (lines 133, 144-148)**

  Change all four occurrences of `http://localhost:5001/admin/` to `http://localhost:5001/sign-in`:
  ```yaml
  if curl -sf --max-time 2 http://localhost:5001/sign-in > /dev/null 2>&1; then
  ```
  ```yaml
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:5001/sign-in)
  if [ "$STATUS" -lt "500" ]; then
    echo "/sign-in returned $STATUS"
  else
    echo "/sign-in returned $STATUS (expected < 500)"
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add .github/workflows/deploy.yml .github/workflows/ci.yml
  git commit -m "ci: update base path references and CloudFront invalidation path"
  ```

---

## Task 10: Update Kubernetes probe path

The probe path in `kubernetes-bootstrap` was set to `/admin/auth` in the previous session. Now that `/admin/auth` no longer exists, update it to `/sign-in`.

**Files:**
- Modify: `../kubernetes-bootstrap/charts/tucaken-app/chart/values.yaml`

- [ ] **Step 1: Update probe paths**

  In `charts/tucaken-app/chart/values.yaml`, find the probes section and update both paths:
  ```yaml
  probes:
    readiness:
      path: /sign-in
      initialDelaySeconds: 10
      periodSeconds: 10
      timeoutSeconds: 10
      failureThreshold: 3
    liveness:
      path: /sign-in
      initialDelaySeconds: 30
      periodSeconds: 15
      timeoutSeconds: 10
      failureThreshold: 3
  ```

  Also update the comment above:
  ```yaml
  # Health Probes
  #
  # / redirects (307) to /sign-in when unauthenticated — probe targets /sign-in
  # directly: public route, no redirect, 200 always. timeoutSeconds: 10 covers
  # getUserSessionFn() Cognito cold-start on pod startup.
  ```

- [ ] **Step 2: Commit in kubernetes-bootstrap**
  ```bash
  cd /Users/nelsonlamounier/Desktop/portfolio/kubernetes-bootstrap
  git add charts/tucaken-app/chart/values.yaml
  git commit -m "fix(tucaken-app): update probe path from /admin/auth to /sign-in"
  git push origin main
  ```

---

## Task 11: Cognito App Client — add new callback URI (manual step)

This must happen **before** deploying the new image. If the new image is deployed before Cognito knows about `/sign-in/callback`, OAuth sign-in will return an error.

- [ ] **Step 1: Add `/sign-in/callback` to Cognito**

  Run the update script (update the `appUrl` arg to your production domain):
  ```bash
  cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
  yarn tsx scripts/update-cognito-prod.ts --app-url https://tucaken.io
  ```

  Or manually in the AWS Console:
  - Go to Cognito → User Pools → your pool → App clients → tucaken-app client
  - Add `https://tucaken.io/sign-in/callback` to **Allowed callback URLs**
  - Add `https://tucaken.io/sign-in` to **Allowed sign-out URLs**
  - Save changes (keep old `/admin/...` URLs until after deploy verification)

- [ ] **Step 2: Verify Cognito accepts the new URI**

  The script outputs the current Cognito client config — confirm both old and new URIs are present.

---

## Task 12: Full build verification

- [ ] **Step 1: Build the app**
  ```bash
  cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
  yarn build
  ```
  Expected: build succeeds with no errors. `dist/client/assets/styles.css` exists.

- [ ] **Step 2: Start the production server locally**
  ```bash
  node server.js
  ```
  Expected: `🚀 Production server listening at http://0.0.0.0:5001`

- [ ] **Step 3: Verify route responses**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/
  # Expected: 200

  curl -sv http://localhost:5001/ 2>&1 | grep "< HTTP\|location:"
  # Expected: 200 (no redirect)

  curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/sign-in
  # Expected: 200

  curl -sv http://localhost:5001/overview 2>&1 | grep "location:"
  # Expected: redirects to /sign-in (no auth cookie = protected route redirects)

  curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/assets/styles.css
  # Expected: 200 (CSS loads directly, no /admin prefix)
  ```

- [ ] **Step 4: Verify styles render in browser**

  Open `http://localhost:5001/` — the home page must render with styles and all sections visible (hero, how-it-works, pricing, FAQ, footer).

  Open `http://localhost:5001/sign-in` — the `EnergeticAuthShell` must render with styles.

- [ ] **Step 5: Run tests**
  ```bash
  yarn test
  ```
  Expected: all 148 tests pass (or current count).

- [ ] **Step 6: Push tucaken-app to trigger CI/CD**
  ```bash
  cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
  git push origin main
  ```

---

## Task 13: Post-deploy verification and Cognito cleanup

- [ ] **Step 1: Verify production routes**
  ```bash
  curl -sv https://tucaken.io/ 2>&1 | grep "< HTTP\|location:"
  # Expected: 200 (home page, no redirect)

  curl -s -o /dev/null -w "%{http_code}" https://tucaken.io/sign-in
  # Expected: 200

  curl -s -o /dev/null -w "%{http_code}" https://tucaken.io/admin/
  # Expected: 307 or 404 (old path gone)
  ```

- [ ] **Step 2: Test OAuth sign-in end-to-end**

  Navigate to `https://tucaken.io/sign-in` → click Google sign-in → complete OAuth flow → should land at `https://tucaken.io/overview`.

- [ ] **Step 3: Remove old Cognito callback URI**

  Once production is verified working:
  - AWS Console → Cognito App Client → remove `https://tucaken.io/admin/auth/callback` from callback URLs
  - Remove `https://tucaken.io/admin/login` from sign-out URLs

- [ ] **Step 4: Push kubernetes-bootstrap if not already done**
  ```bash
  cd /Users/nelsonlamounier/Desktop/portfolio/kubernetes-bootstrap
  git push origin main
  ```
  ArgoCD will sync the probe path update. The new pod from the tucaken-app deploy will already be using `/sign-in` routes — this probe update confirms health check alignment.
