# Admin Route Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict Comments, Articles, Reports, and Test Components routes to admin users only — hiding them from the sidebar and redirecting non-admins at the route level.

**Architecture:** `role` is already stored in the DB and returned inside the `plan` object from `/api/admin/me` — the frontend type just doesn't declare it. We surface it via the type, expose `isAdmin` in the `_dashboard` route context, gate the four routes with `beforeLoad`, and filter the sidebar nav list.

**Tech Stack:** TanStack Router (`beforeLoad`, `redirect`), React, TypeScript — no new dependencies.

---

## File Map

| File | Change |
|---|---|
| `src/server/me.ts` | Add `role: string` to `MeResponse.plan` |
| `src/app/_dashboard.tsx` | Return `isAdmin` from `beforeLoad`; pass to `AppLayout` |
| `src/components/layouts/AppLayout.tsx` | Accept + thread `isAdmin`; mark admin nav items; filter in `SidebarNavList` |
| `src/app/_dashboard.comments.tsx` | Add admin `beforeLoad` guard |
| `src/app/_dashboard.articles.tsx` | Add admin `beforeLoad` guard |
| `src/app/_dashboard.reports.tsx` | Add admin `beforeLoad` guard |
| `src/app/_dashboard.test.tsx` | Add admin `beforeLoad` guard |

---

## Task 1: Add `role` to `MeResponse.plan` type

**Files:**
- Modify: `src/server/me.ts`

- [ ] **Step 1: Open the file and locate `MeResponse`**

`src/server/me.ts` lines 14–31. The `plan` object is missing `role`.

- [ ] **Step 2: Add `role` to the type**

Replace the `plan` block inside `MeResponse`:

```ts
export interface MeResponse {
  id:        string
  email:     string
  name?:     string
  avatarUrl?: string
  /** True only on the first-ever sign-in — authoritative signal from the DB insert. */
  isNew:     boolean
  plan: {
    plan:                 string
    effectivePlan:        'pro' | 'trial' | 'free'
    role:                 string   // 'user' | 'admin' — already returned by the API
    trialStartedAt:       string | null
    trialEndsAt:          string | null
    trialDaysRemaining:   number | null
    subscriptionStatus:   string | null
    stripeCustomerId:     string | null
    stripeSubscriptionId: string | null
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `MeResponse`.

- [ ] **Step 4: Commit**

```bash
git add src/server/me.ts
git commit -m "feat(auth): expose role field in MeResponse plan type"
```

---

## Task 2: Expose `isAdmin` in the dashboard route context

**Files:**
- Modify: `src/app/_dashboard.tsx`

- [ ] **Step 1: Update `beforeLoad` return value**

In `_dashboard.tsx`, change the return at line 35:

```ts
return { me, isAdmin: me.plan.role === 'admin' }
```

- [ ] **Step 2: Pass `isAdmin` to `AppLayout`**

Update `DashboardLayout` to read and forward `isAdmin`:

```tsx
function DashboardLayout() {
  const { me, isAdmin } = Route.useRouteContext()
  const matches = useMatches()
  const disableMainWrapper = matches.some((match) => (match.staticData as { disableMainWrapper?: boolean })?.disableMainWrapper)

  return (
    <AppLayout me={me} isAdmin={isAdmin} disableMainWrapper={disableMainWrapper}>
      <Outlet />
    </AppLayout>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about `isAdmin` missing from `AppLayoutProps` — that's correct, fixed in Task 3.

- [ ] **Step 4: Commit after Task 3 passes (skip standalone commit here)**

---

## Task 3: Thread `isAdmin` through `AppLayout` and filter sidebar nav

**Files:**
- Modify: `src/components/layouts/AppLayout.tsx`

- [ ] **Step 1: Add `adminOnly` flag to nav items**

Replace the `navigation` const (around line 45):

```ts
const navigation = [
  { name: "Dashboard",       href: "/overview",      icon: HomeIcon,           adminOnly: false },
  { name: "Comments",        href: "/comments",      icon: MessageSquareText,  adminOnly: true  },
  { name: "Applications",    href: "/applications",  icon: BriefcaseIcon,      adminOnly: false },
  { name: "Articles",        href: "/articles",      icon: DocumentDuplicateIcon, adminOnly: true },
  { name: "Resumes",         href: "/resumes",       icon: DocumentTextIcon,   adminOnly: false },
  { name: "Projects",        href: "/projects",      icon: FolderIcon,         adminOnly: false },
  { name: "Calendar",        href: "/calendar",      icon: CalendarIcon,       adminOnly: false },
  { name: "Reports",         href: "/reports",       icon: ChartPieIcon,       adminOnly: true  },
  { name: "Test Components", href: "/test",          icon: BeakerIcon,         adminOnly: true  },
]
```

Note: remove `as const` — the array is now mutable-typed so `adminOnly` can vary per item.

- [ ] **Step 2: Add `isAdmin` to `AppLayoutProps`**

Update the interface (around line 116):

```ts
interface AppLayoutProps {
  children: React.ReactNode
  me?: MeResponse
  isAdmin?: boolean
  disableMainWrapper?: boolean
}
```

- [ ] **Step 3: Accept `isAdmin` in `AppLayout` and thread to sidebar components**

Update the function signature and both `SidebarNavList` usages:

```tsx
export default function AppLayout({
  children,
  me,
  isAdmin = false,
  disableMainWrapper = false,
}: AppLayoutProps) {
```

In the mobile sidebar nav (around line 219):
```tsx
<SidebarNavList isAdmin={isAdmin} />
```

In the desktop sidebar nav (around line 239):
```tsx
<SidebarNavList isAdmin={isAdmin} />
```

- [ ] **Step 4: Update `SidebarNavList` to accept and use `isAdmin`**

Replace the `SidebarNavList` function (around line 288):

```tsx
function SidebarNavList({ isAdmin }: { isAdmin: boolean }) {
  const visibleNav = navigation.filter((item) => !item.adminOnly || isAdmin)

  return (
    <ul
      role="list"
      className="flex flex-1 flex-col gap-y-7"
    >
      <li>
        <ul
          role="list"
          className="-mx-2 space-y-1"
        >
          {visibleNav.map((item) => (
            <li key={item.name}>
              <Link
                to={item.href as string}
                activeProps={{
                  className:
                    "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white",
                }}
                inactiveProps={{
                  className:
                    "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white",
                }}
                className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold transition-colors"
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      aria-hidden="true"
                      className={classNames(
                        isActive
                          ? "text-teal-600 dark:text-teal-400"
                          : "text-zinc-400 dark:text-zinc-400 group-hover:text-teal-600 dark:group-hover:text-teal-400",
                        "size-6 shrink-0 transition-colors",
                      )}
                    />
                    {item.name}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </li>
      <li>
        <div className="text-xs/6 font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
          Settings
        </div>
        <ul
          role="list"
          className="-mx-2 space-y-1"
        >
          {settingsNavigation.map((item) => (
            <li key={item.name}>
              <Link
                to={item.href as string}
                activeProps={{
                  className:
                    "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white",
                }}
                inactiveProps={{
                  className:
                    "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white",
                }}
                className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold transition-colors"
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      aria-hidden="true"
                      className={classNames(
                        isActive
                          ? "text-teal-600 dark:text-teal-400"
                          : "text-zinc-400 dark:text-zinc-400 group-hover:text-teal-600 dark:group-hover:text-teal-400",
                        "size-6 shrink-0 transition-colors",
                      )}
                    />
                    {item.name}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </li>
    </ul>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: clean output.

- [ ] **Step 6: Commit Tasks 2 + 3 together**

```bash
git add src/app/_dashboard.tsx src/components/layouts/AppLayout.tsx
git commit -m "feat(auth): thread isAdmin through dashboard context and filter sidebar nav"
```

---

## Task 4: Gate the four admin-only routes

**Files:**
- Modify: `src/app/_dashboard.comments.tsx`
- Modify: `src/app/_dashboard.articles.tsx`
- Modify: `src/app/_dashboard.reports.tsx`
- Modify: `src/app/_dashboard.test.tsx`

Each route adds a `beforeLoad` that reads `context.isAdmin` (set by the parent `_dashboard` route) and redirects non-admins to `/overview`.

- [ ] **Step 1: Gate `_dashboard.comments.tsx`**

Replace the file content:

```ts
import { createFileRoute, redirect } from '@tanstack/react-router'
import { CommentModeration } from '../features/comments/components/CommentModeration'

export const Route = createFileRoute('/_dashboard/comments')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: CommentModeration,
})
```

- [ ] **Step 2: Gate `_dashboard.articles.tsx`**

Replace the file content:

```ts
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArticleContainer } from '../features/articles/components/ArticleContainer'
import { DashboardPage } from '../components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/articles')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: ArticlesPage,
})

function ArticlesPage() {
  return (
    <DashboardPage
      title="Article Management"
      description="Review, edit, publish, and delete Bedrock-generated article versions."
    >
      <ArticleContainer />
    </DashboardPage>
  )
}
```

- [ ] **Step 3: Gate `_dashboard.reports.tsx`**

Replace the file content:

```ts
import { createFileRoute, redirect } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import ReportContainer from '@/features/reports/components/ReportContainer'

export const Route = createFileRoute('/_dashboard/reports')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: ReportsPage,
})

function ReportsPage() {
  return (
    <DashboardPage title="Reporting">
      <div>
        <h2 className="mb-4 text-xl font-bold text-zinc-100">Global AI Usage</h2>
        <ReportContainer />
      </div>
    </DashboardPage>
  )
}
```

- [ ] **Step 4: Gate `_dashboard.test.tsx`**

Replace the file content:

```ts
import { createFileRoute, redirect } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ArticleContainer } from '@/features/articles/components/ArticleContainer'

export const Route = createFileRoute('/_dashboard/test')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: TestRoute,
})

function TestRoute() {
  return (
    <DashboardPage
      title="Test Sandbox"
      description="A designated UI testing area to validate and experiment with new components."
    >
      <ArticleContainer />
    </DashboardPage>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: clean output. If `context.isAdmin` is unknown to TypeScript, check that `_dashboard.tsx` `beforeLoad` returns `{ me, isAdmin }` as updated in Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/app/_dashboard.comments.tsx src/app/_dashboard.articles.tsx src/app/_dashboard.reports.tsx src/app/_dashboard.test.tsx
git commit -m "feat(auth): redirect non-admin users away from admin-only routes"
```

---

## Task 5: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Sign in as a non-admin user**

Navigate to `http://localhost:3000`. Sign in with a non-admin account.

Expected:
- Sidebar shows: Dashboard, Applications, Resumes, Projects, Calendar, Settings, Billing, Database
- Comments, Articles, Reports, Test Components are **not visible**

- [ ] **Step 3: Try direct URL access as non-admin**

Navigate to `http://localhost:3000/comments`, `/articles`, `/reports`, `/test` directly.

Expected: all four redirect immediately to `/overview`.

- [ ] **Step 4: Sign in as admin**

Sign in with the admin account (`lamounierleao@gmail.com` or whichever account has `role='admin'` in the DB).

Expected:
- Sidebar shows all items including Comments, Articles, Reports, Test Components
- All four routes load normally

- [ ] **Step 5: Commit smoke test confirmation (no code change)**

No commit needed — this is verification only.
