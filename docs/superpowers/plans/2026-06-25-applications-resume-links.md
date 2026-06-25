# Applications Resume & Cover-Letter Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each application's tailored resume + cover letter (Preview/Edit) directly in the Job Applications list, move publish into Applications (email-gated), and decommission the standalone `/resumes` hub.

**Architecture:** `getTailoredResumesFn` (already used by the soon-dead Resumes hub) is extended to carry `coverLetter`; `ApplicationsList` fetches it once and feeds each row a `TailoredResumeSummary`. A new `ApplicationRowActions` renders presence-gated icon buttons; one shared drawer set lives in `ApplicationsList`. Cover-letter edit follows the existing annotations override pattern — DB column already provisioned (migration 103), so only admin-api read-merge + a PUT route + a client server fn are new. The `/resumes` route group migrates to directory form as a bare drawer host; nav entry and quick-links are removed; `ResumesDisplayer` is deleted.

**Tech Stack:** TanStack Start (server fns), TanStack Router (directory routes), TanStack Query, TanStack Form, Zod, Hono (admin-api), Vitest, Tailwind v4, lucide-react.

## Global Constraints

- Package manager: **Yarn 4 only** (`yarn add`, `yarn workspace admin-api add`, `yarn test`, never npm/npx).
- Before any task is "done": `yarn typecheck && yarn lint && yarn test` green (run from worktree root). admin-api tests: `yarn workspace admin-api test`.
- New routes: **directory-based only** under `src/app/_dashboard/<segment>/`; never edit `routeTree.gen.ts` (regenerates on `yarn dev`/build).
- Prose/copy: **English (UK)**, no diacritics; term is **resume** (not résumé). Product name **Tucaken**, never "agent".
- Corner radius default `rounded-md`; icon-only circular buttons may be `rounded-full`.
- SonarQube rules: no nested ternaries (S3358 — split JSX branches / early returns), guard clauses after hooks, no `as any`, optional chaining over `&&`, `Set.has()` for allow-lists, stable React keys (slug, never index), no `console.*` (use Pino), `crypto.randomUUID()` for ids.
- Cyclomatic complexity ≤ 10 per function (ESLint core `complexity` rule).
- Commits: follow `git-commit` skill; **no `Co-Authored-By` trailer**.
- Motion: import from `motion/react` if any animation added (none required here).
- All server boundaries validate input with Zod. Cover-letter write re-checks auth.

## Working directory

All paths are relative to the worktree root:
`/Users/nelsonlamounier/Desktop/portfolio/tucaken-app/.claude/worktrees/feat+applications-resume-links`
admin-api is the `admin-api/` workspace inside it. The DB migration (103) lives in the sibling **ai-applications** repo and is already committed — this plan does **not** add migrations.

## File structure (created / modified)

- Modify `src/server/applications.ts` — extend `TailoredResumeSummary` + `getTailoredResumesFn` with `coverLetter`; add `updateApplicationCoverLetterFn`.
- Modify `admin-api/src/lib/repositories/applications.ts` — add `updateApplicationCoverLetter`; read `cover_letter_override` in `rowToApplication`.
- Modify `admin-api/src/routes/applications.ts` — merge override into `analysis.coverLetter`; add `PUT /:slug/cover-letter`.
- Create `src/features/applications/hooks/use-tailored-resumes.ts` — `useTailoredResumes` hook + query options.
- Create `src/features/applications/components/ApplicationRowActions.tsx` — per-row icon buttons.
- Modify `src/features/applications/components/ApplicationListRow.tsx` — link region + actions cell.
- Modify `src/features/applications/components/ApplicationsList.tsx` — fetch tailored map, own shared drawers, column header.
- Modify `src/features/applications/components/ApplicationActionsMenu.tsx` — email-gated publish.
- Modify `src/app/_dashboard/applications/$slug.tsx` (detail route) — thread `me.email` to `ApplicationActionsMenu`.
- Create `src/app/_dashboard/resumes/route.tsx`, `src/app/_dashboard/resumes/edit.$id/route.tsx`, `src/app/_dashboard/resumes/new/route.tsx` — directory routes.
- Delete `src/app/_dashboard.resumes.tsx`, `src/app/_dashboard.resumes.edit.$id.tsx`, `src/app/_dashboard.resumes.new.tsx`, `src/features/resumes/components/ResumesDisplayer.tsx`.
- Modify `src/components/layouts/AppLayout.tsx` — remove Resumes nav entry.
- Modify `src/features/overview/components/DashboardOverview.tsx`, `src/features/reports/components/ReportContainer.tsx` — remove "Manage Resumes" quick-link.

---

### Task 1: Extend tailored-resume data with cover letter

**Files:**
- Modify: `src/server/applications.ts:203-257`
- Test: `src/__tests__/server/tailored-resumes.test.ts` (create)

**Interfaces:**
- Consumes: `ApplicationDetail.analysis.coverLetter: CoverLetter | null`, `CoverLetter` from `@/lib/types/applications.types`.
- Produces: `TailoredResumeSummary` now has `readonly coverLetter: CoverLetter | null`. Consumed by Tasks 4, 5, 7.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/server/tailored-resumes.test.ts
import { describe, it, expect } from 'vitest'
import type { TailoredResumeSummary } from '@/server/applications'
import type { CoverLetter } from '@/lib/types/applications.types'

describe('TailoredResumeSummary', () => {
  it('carries a coverLetter field (nullable)', () => {
    const cl: CoverLetter = {
      greeting: 'Dear Hiring Manager',
      paragraphs: ['Body.'],
      signoff: { name: 'Nelson', email: 'a@b.c', linkedin: '', github: '' },
    }
    const withCl: TailoredResumeSummary = {
      slug: 's', targetCompany: 'C', targetRole: 'R', updatedAt: '2026-01-01',
      data: {} as TailoredResumeSummary['data'], coverLetter: cl,
    }
    const withoutCl: TailoredResumeSummary = { ...withCl, coverLetter: null }
    expect(withCl.coverLetter?.greeting).toBe('Dear Hiring Manager')
    expect(withoutCl.coverLetter).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/server/tailored-resumes.test.ts`
Expected: FAIL — `coverLetter` not assignable / missing on `TailoredResumeSummary`.

- [ ] **Step 3: Add the field + populate it**

In `src/server/applications.ts`, add the `CoverLetter` import to the existing type import block (line 17-22):

```ts
import type {
  ApplicationSummary,
  ApplicationStatus,
  ApplicationDetail,
  ScheduledInterview,
  CoverLetter,
} from '@/lib/types/applications.types'
```

Extend the interface (line 203-209):

```ts
export interface TailoredResumeSummary {
  readonly slug: string
  readonly targetCompany: string
  readonly targetRole: string
  readonly updatedAt: string
  readonly data: ResumeData
  readonly coverLetter: CoverLetter | null
}
```

In the `getTailoredResumesFn` push block (line 244-251), add the field — the detail is already loaded, so no extra call:

```ts
      tailored.push({
        slug: candidates[i].slug,
        targetCompany: candidates[i].targetCompany,
        targetRole: candidates[i].targetRole,
        updatedAt: candidates[i].updatedAt,
        data: result.value.application.analysis.tailoredResume,
        coverLetter: result.value.application.analysis.coverLetter ?? null,
      })
```

- [ ] **Step 4: Run test + typecheck**

Run: `yarn test src/__tests__/server/tailored-resumes.test.ts && yarn typecheck`
Expected: PASS, 0 type errors. (`ResumesDisplayer` still compiles — it ignores the new field.)

- [ ] **Step 5: Commit**

```bash
git add src/server/applications.ts src/__tests__/server/tailored-resumes.test.ts
git commit -m "feat(applications): carry cover letter on tailored-resume summary"
```

---

### Task 2: admin-api — cover-letter override read-merge + write

**Files:**
- Modify: `admin-api/src/lib/repositories/applications.ts` (`rowToApplication` ~24-42; add `updateApplicationCoverLetter` near `updateApplicationAnnotations` ~84-93)
- Modify: `admin-api/src/routes/applications.ts` (analysis build ~465-481; add route near annotations route ~679-697)
- Test: `admin-api/src/lib/repositories/applications.cover-letter.test.ts` (create)

**Interfaces:**
- Consumes: existing `Queryable`, `withUser`, `getApplication`, `getPool(config)`, `updateApplicationAnnotations` pattern.
- Produces: `updateApplicationCoverLetter(pool, id, coverLetter)`; `Application.coverLetterOverride: CoverLetter | null`; route `PUT /applications/:slug/cover-letter`. Consumed by Task 3.

Background: migration `103_application_cover_letter_override.sql` already added
`cover_letter_override JSONB NOT NULL DEFAULT 'null'::jsonb`. This task wires it.

- [ ] **Step 1: Write the failing test (repository upsert builds correct SQL)**

```ts
// admin-api/src/lib/repositories/applications.cover-letter.test.ts
import { describe, it, expect, vi } from 'vitest'
import { updateApplicationCoverLetter } from './applications.js'

describe('updateApplicationCoverLetter', () => {
  it('writes the override JSON to cover_letter_override by id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const cl = { greeting: 'Hi', paragraphs: ['p'], signoff: { name: 'N', email: '', linkedin: '', github: '' } }
    await updateApplicationCoverLetter({ query } as never, 'app-1', cl)
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('cover_letter_override')
    expect(sql).toContain('$2::jsonb')
    expect(params[0]).toBe('app-1')
    expect(params[1]).toBe(JSON.stringify(cl))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test src/lib/repositories/applications.cover-letter.test.ts`
Expected: FAIL — `updateApplicationCoverLetter` is not exported.

- [ ] **Step 3: Implement repository function + row mapping**

In `admin-api/src/lib/repositories/applications.ts`, add after `updateApplicationAnnotations`:

```ts
/** Replace the per-application cover-letter override (null = no override; pipeline value shows). */
export async function updateApplicationCoverLetter(
    pool: Queryable,
    id: string,
    coverLetter: unknown,
): Promise<void> {
    await pool.query(
        `UPDATE job_applications SET cover_letter_override = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [id, JSON.stringify(coverLetter)],
    );
}
```

In `rowToApplication`, add the column (after `userAnnotations`):

```ts
        coverLetterOverride: (row['cover_letter_override'] as Record<string, unknown> | null | undefined) ?? null,
```

Add `coverLetterOverride: Record<string, unknown> | null` to the `Application` interface in this file (mirror where `userAnnotations` is declared).

- [ ] **Step 4: Run repo test**

Run: `yarn workspace admin-api test src/lib/repositories/applications.cover-letter.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire read-merge into the analysis response**

In `admin-api/src/routes/applications.ts`, change the `coverLetter` line in the `analysis` object (line 467) to prefer the override:

```ts
        coverLetter:       application.coverLetterOverride ?? rawAnalysis['coverLetter'] ?? null,
```

(`application` is already in scope where `analysis` is built — confirm; it is the row loaded via `getApplication`. If the variable is named differently at that point, use the in-scope application row.)

- [ ] **Step 6: Add the PUT route**

In `admin-api/src/routes/applications.ts`, mirror the annotations route. Add near line 697:

```ts
// ── PUT /:slug/cover-letter — override the tailored cover letter (immutable pipeline output) ──
app.put('/:slug/cover-letter', async (ctx) => {
  const userId = ctx.get('userId');
  if (!userId) return ctx.json({ error: 'User not provisioned — retry in a moment' }, 503);

  const slug = ctx.req.param('slug');

  let body: { coverLetter?: unknown };
  try { body = await ctx.req.json(); }
  catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

  const parsed = coverLetterSchema.safeParse(body.coverLetter);
  if (!parsed.success) return ctx.json({ error: 'Invalid cover letter shape' }, 400);

  return withUser(getPool(config), userId, async (db) => {
    const application = await getApplication(db, slug);
    if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

    await updateApplicationCoverLetter(db, application.id, parsed.data);
    return ctx.json({ success: true });
  });
});
```

Add the Zod schema near the top of the routes file (mirror `CoverLetter`/`CoverLetterSignoff`), and add `updateApplicationCoverLetter` to the import from `../lib/repositories/applications.js`:

```ts
const coverLetterSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  signoff: z.object({
    name: z.string(),
    email: z.string(),
    linkedin: z.string(),
    github: z.string(),
  }),
});
```

(If `z` is not yet imported in this routes file, add `import { z } from 'zod'`.)

- [ ] **Step 7: Run admin-api checks**

Run: `yarn workspace admin-api test && yarn typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add admin-api/src/lib/repositories/applications.ts admin-api/src/routes/applications.ts admin-api/src/lib/repositories/applications.cover-letter.test.ts
git commit -m "feat(admin-api): cover-letter override read-merge and PUT endpoint"
```

---

### Task 3: Client server fn — updateApplicationCoverLetterFn

**Files:**
- Modify: `src/server/applications.ts` (add after `patchApplicationAnnotationsFn` ~138)
- Test: `src/__tests__/server/cover-letter-fn.test.ts` (create)

**Interfaces:**
- Consumes: `apiFetch`, `requireAuth`, `CoverLetter` type, the `PUT /applications/:slug/cover-letter` route (Task 2).
- Produces: `updateApplicationCoverLetterFn({ data: { slug, coverLetter } }) => { success: true }`. Consumed by Task 7.

- [ ] **Step 1: Write the failing test (schema accepts valid, rejects invalid)**

```ts
// src/__tests__/server/cover-letter-fn.test.ts
import { describe, it, expect } from 'vitest'
import { coverLetterBodySchema } from '@/server/applications'

describe('coverLetterBodySchema', () => {
  it('accepts a well-formed cover letter', () => {
    const ok = coverLetterBodySchema.safeParse({
      slug: 'acme-dev',
      coverLetter: { greeting: 'Hi', paragraphs: ['p'], signoff: { name: 'N', email: '', linkedin: '', github: '' } },
    })
    expect(ok.success).toBe(true)
  })
  it('rejects a missing slug', () => {
    const bad = coverLetterBodySchema.safeParse({ coverLetter: { greeting: '', paragraphs: [], signoff: { name: '', email: '', linkedin: '', github: '' } } })
    expect(bad.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/server/cover-letter-fn.test.ts`
Expected: FAIL — `coverLetterBodySchema` not exported.

- [ ] **Step 3: Implement schema + server fn**

In `src/server/applications.ts`, add the exported schema near the other input schemas (after line 41) and the server fn after `patchApplicationAnnotationsFn`:

```ts
export const coverLetterBodySchema = z.object({
  slug: z.string().min(1),
  coverLetter: z.object({
    greeting: z.string(),
    paragraphs: z.array(z.string()),
    signoff: z.object({
      name: z.string(),
      email: z.string(),
      linkedin: z.string(),
      github: z.string(),
    }),
  }),
})

/**
 * Overrides the tailored cover letter for an application. The pipeline output is
 * immutable; this persists a per-application override merged at read time.
 */
export const updateApplicationCoverLetterFn = createServerFn({ method: 'POST' })
  .inputValidator(coverLetterBodySchema)
  .handler(async ({ data }) => {
    await requireAuth()

    await apiFetch<{ success: boolean }>(
      `/applications/${encodeURIComponent(data.slug)}/cover-letter`,
      {
        method: 'PUT',
        body: JSON.stringify({ coverLetter: data.coverLetter }),
        pathTemplate: '/applications/:slug/cover-letter',
      },
    )
    return { success: true }
  })
```

- [ ] **Step 4: Run test + typecheck**

Run: `yarn test src/__tests__/server/cover-letter-fn.test.ts && yarn typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/applications.ts src/__tests__/server/cover-letter-fn.test.ts
git commit -m "feat(applications): server fn to override application cover letter"
```

---

### Task 4: useTailoredResumes hook

**Files:**
- Create: `src/features/applications/hooks/use-tailored-resumes.ts`
- Test: `src/__tests__/features/applications/use-tailored-resumes.test.ts` (create)

**Interfaces:**
- Consumes: `getTailoredResumesFn` (Task 1), `adminKeys` from `@/lib/api/query-keys`, `queryOptions`/`useQuery` from `@tanstack/react-query`.
- Produces: `tailoredResumesQueryOptions()`, `useTailoredResumes()`, and a pure helper `buildTailoredMap(list): Map<string, TailoredResumeSummary>`. Consumed by Task 7.

First add a query key. In `src/lib/api/query-keys.ts`, inside `applications`, add:

```ts
    tailoredResumes: ['admin', 'applications', 'tailored-resumes'] as const,
```

- [ ] **Step 1: Write the failing test (map builder keys by slug)**

```ts
// src/__tests__/features/applications/use-tailored-resumes.test.ts
import { describe, it, expect } from 'vitest'
import { buildTailoredMap } from '@/features/applications/hooks/use-tailored-resumes'
import type { TailoredResumeSummary } from '@/server/applications'

const mk = (slug: string): TailoredResumeSummary => ({
  slug, targetCompany: 'C', targetRole: 'R', updatedAt: '2026-01-01',
  data: {} as TailoredResumeSummary['data'], coverLetter: null,
})

describe('buildTailoredMap', () => {
  it('keys entries by slug', () => {
    const m = buildTailoredMap([mk('a'), mk('b')])
    expect(m.get('a')?.slug).toBe('a')
    expect(m.size).toBe(2)
  })
  it('returns an empty map for undefined', () => {
    expect(buildTailoredMap(undefined).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/use-tailored-resumes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook + helper**

```ts
// src/features/applications/hooks/use-tailored-resumes.ts
import { queryOptions, useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getTailoredResumesFn, type TailoredResumeSummary } from '@/server/applications'

/** Tailored resumes change rarely within a session. */
const STALE_TIME = 60_000

export const tailoredResumesQueryOptions = () =>
  queryOptions({
    queryKey: adminKeys.applications.tailoredResumes,
    queryFn: () => getTailoredResumesFn(),
    staleTime: STALE_TIME,
  })

/** Index tailored resumes by application slug for O(1) per-row lookup. */
export function buildTailoredMap(
  list: readonly TailoredResumeSummary[] | undefined,
): Map<string, TailoredResumeSummary> {
  const map = new Map<string, TailoredResumeSummary>()
  if (!list) return map
  for (const item of list) map.set(item.slug, item)
  return map
}

export function useTailoredResumes() {
  return useQuery(tailoredResumesQueryOptions())
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `yarn test src/__tests__/features/applications/use-tailored-resumes.test.ts && yarn typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/hooks/use-tailored-resumes.ts src/lib/api/query-keys.ts src/__tests__/features/applications/use-tailored-resumes.test.ts
git commit -m "feat(applications): useTailoredResumes hook and slug map helper"
```

---

### Task 5: ApplicationRowActions component

**Files:**
- Create: `src/features/applications/components/ApplicationRowActions.tsx`
- Test: `src/__tests__/features/applications/ApplicationRowActions.test.tsx` (create)

**Interfaces:**
- Consumes: `TailoredResumeSummary` (Task 1).
- Produces: `ApplicationRowActions` with props `{ tailored?: TailoredResumeSummary | null; onPreviewResume; onEditResume; onPreviewCoverLetter; onEditCoverLetter }` (all callbacks `() => void`). Buttons are presence-gated. Consumed by Tasks 6/7.

Render rules (presence-gated, no nested ternaries):
- `tailored` present ⇒ render Preview Resume (`Eye`) + Edit Resume (`Pencil`).
- `tailored?.coverLetter` present ⇒ also render Preview Cover Letter (`FileText`) + Edit Cover Letter (`PenLine`).
- nothing present ⇒ render nothing.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/applications/ApplicationRowActions.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationRowActions } from '@/features/applications/components/ApplicationRowActions'
import type { TailoredResumeSummary } from '@/server/applications'

const base: TailoredResumeSummary = {
  slug: 's', targetCompany: 'C', targetRole: 'R', updatedAt: '2026-01-01',
  data: {} as TailoredResumeSummary['data'], coverLetter: null,
}
const noop = () => {}
const props = {
  onPreviewResume: noop, onEditResume: noop,
  onPreviewCoverLetter: noop, onEditCoverLetter: noop,
}

describe('ApplicationRowActions', () => {
  it('renders nothing without a tailored resume', () => {
    const { container } = render(<ApplicationRowActions tailored={null} {...props} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders resume buttons but no cover-letter buttons when coverLetter is null', () => {
    render(<ApplicationRowActions tailored={base} {...props} />)
    expect(screen.getByLabelText('Preview resume')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit resume')).toBeInTheDocument()
    expect(screen.queryByLabelText('Preview cover letter')).toBeNull()
  })
  it('renders cover-letter buttons when present', () => {
    const withCl = { ...base, coverLetter: { greeting: 'H', paragraphs: ['p'], signoff: { name: 'N', email: '', linkedin: '', github: '' } } }
    render(<ApplicationRowActions tailored={withCl} {...props} />)
    expect(screen.getByLabelText('Preview cover letter')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit cover letter')).toBeInTheDocument()
  })
  it('fires onEditResume on click', () => {
    const onEditResume = vi.fn()
    render(<ApplicationRowActions tailored={base} {...{ ...props, onEditResume }} />)
    screen.getByLabelText('Edit resume').click()
    expect(onEditResume).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/ApplicationRowActions.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/applications/components/ApplicationRowActions.tsx
import { Eye, Pencil, FileText, PenLine } from 'lucide-react'
import type { TailoredResumeSummary } from '@/server/applications'

interface ApplicationRowActionsProps {
  readonly tailored?: TailoredResumeSummary | null
  readonly onPreviewResume: () => void
  readonly onEditResume: () => void
  readonly onPreviewCoverLetter: () => void
  readonly onEditCoverLetter: () => void
}

const BTN =
  'inline-flex size-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100'

export function ApplicationRowActions({
  tailored,
  onPreviewResume,
  onEditResume,
  onPreviewCoverLetter,
  onEditCoverLetter,
}: ApplicationRowActionsProps) {
  if (!tailored) return null

  const hasCoverLetter = Boolean(tailored.coverLetter)

  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" aria-label="Preview resume" className={BTN} onClick={onPreviewResume}>
        <Eye className="size-4" />
      </button>
      <button type="button" aria-label="Edit resume" className={BTN} onClick={onEditResume}>
        <Pencil className="size-4" />
      </button>
      {hasCoverLetter && (
        <button type="button" aria-label="Preview cover letter" className={BTN} onClick={onPreviewCoverLetter}>
          <FileText className="size-4" />
        </button>
      )}
      {hasCoverLetter && (
        <button type="button" aria-label="Edit cover letter" className={BTN} onClick={onEditCoverLetter}>
          <PenLine className="size-4" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test + lint**

Run: `yarn test src/__tests__/features/applications/ApplicationRowActions.test.tsx && yarn lint`
Expected: PASS, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/components/ApplicationRowActions.tsx src/__tests__/features/applications/ApplicationRowActions.test.tsx
git commit -m "feat(applications): presence-gated row actions for resume and cover letter"
```

---

### Task 6: Refactor ApplicationListRow (link region + actions cell)

**Files:**
- Modify: `src/features/applications/components/ApplicationListRow.tsx`
- Test: `src/__tests__/features/applications/ApplicationListRow.test.tsx` (create)

**Interfaces:**
- Consumes: `ApplicationSummary`, `TailoredResumeSummary`, `ApplicationRowActions` (Task 5).
- Produces: `ApplicationListRow` props become `{ app; tailored?; onOpen; onPreviewResume; onEditResume; onPreviewCoverLetter; onEditCoverLetter }`. The info cells are a `<Link>`; actions are real buttons (no nested interactive-in-button). Consumed by Task 7.

A row is currently one `<button>`; nesting buttons inside is invalid. Replace the
outer button with a grid `<div>`; wrap info cells in a `<Link>`; put actions in a
trailing cell. New grid template adds an actions column: `sm:grid-cols-[1.5fr_1.5fr_14rem_9rem_auto]`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/applications/ApplicationListRow.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRootRoute, createRouter, RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import { ApplicationListRow } from '@/features/applications/components/ApplicationListRow'
import type { ApplicationSummary } from '@/lib/types/applications.types'

const app = {
  slug: 'acme-dev', targetCompany: 'Acme', targetRole: 'Dev',
  status: 'applied', interviewStage: 'applied', updatedAt: '2026-01-01',
} as unknown as ApplicationSummary

function renderInRouter(ui: React.ReactNode) {
  const root = createRootRoute({ component: () => <>{ui}</> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterProvider router={router} />)
}

const cb = {
  onOpen: () => {}, onPreviewResume: () => {}, onEditResume: () => {},
  onPreviewCoverLetter: () => {}, onEditCoverLetter: () => {},
}

describe('ApplicationListRow', () => {
  it('renders company + role and no action buttons without a tailored resume', () => {
    renderInRouter(<ApplicationListRow app={app} tailored={null} {...cb} />)
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.queryByLabelText('Edit resume')).toBeNull()
  })
  it('shows resume actions when a tailored resume exists', () => {
    const tailored = { slug: 'acme-dev', targetCompany: 'Acme', targetRole: 'Dev', updatedAt: '2026-01-01', data: {}, coverLetter: null }
    renderInRouter(<ApplicationListRow app={app} tailored={tailored as never} {...cb} />)
    expect(screen.getByLabelText('Edit resume')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/ApplicationListRow.test.tsx`
Expected: FAIL — new props/markup not present (old component takes `onClick`).

- [ ] **Step 3: Rewrite the component**

```tsx
// src/features/applications/components/ApplicationListRow.tsx
import { Link } from '@tanstack/react-router'
import type { ApplicationSummary } from '@/lib/types/applications.types'
import type { TailoredResumeSummary } from '@/server/applications'
import { StatusBadge } from './StatusBadge'
import { StageProgressTrack } from './StageProgressTrack'
import { ApplicationRowActions } from './ApplicationRowActions'

/**
 * One application as a list row: company / role link to the detail page, the
 * seven-phase progress track, the lifecycle status, and a trailing actions cell
 * with resume / cover-letter Preview & Edit buttons (presence-gated).
 */
export function ApplicationListRow({
  app,
  tailored,
  onOpen,
  onPreviewResume,
  onEditResume,
  onPreviewCoverLetter,
  onEditCoverLetter,
}: {
  readonly app: ApplicationSummary
  readonly tailored?: TailoredResumeSummary | null
  readonly onOpen: () => void
  readonly onPreviewResume: () => void
  readonly onEditResume: () => void
  readonly onPreviewCoverLetter: () => void
  readonly onEditCoverLetter: () => void
}) {
  return (
    <div className="grid w-full grid-cols-1 items-start gap-2 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 sm:grid-cols-[1.5fr_1.5fr_14rem_9rem_auto] sm:items-center sm:gap-4">
      <Link
        to="/applications/$slug"
        params={{ slug: app.slug }}
        onClick={onOpen}
        className="contents text-left"
      >
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{app.targetCompany}</span>
        <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{app.targetRole}</span>
        <StageProgressTrack current={app.interviewStage} />
        <div className="justify-self-start">
          <StatusBadge status={app.status} />
        </div>
      </Link>
      <ApplicationRowActions
        tailored={tailored}
        onPreviewResume={onPreviewResume}
        onEditResume={onEditResume}
        onPreviewCoverLetter={onPreviewCoverLetter}
        onEditCoverLetter={onEditCoverLetter}
      />
    </div>
  )
}
```

Note: `className="contents"` lets the `<Link>` participate in the parent grid without adding a box. If `contents` causes layout issues in manual testing, fall back to making each info cell its own `<Link>` (4 links) — but try `contents` first.

- [ ] **Step 4: Run test**

Run: `yarn test src/__tests__/features/applications/ApplicationListRow.test.tsx`
Expected: PASS. (`ApplicationsList` will not compile yet — fixed in Task 7. Do not run full typecheck here; proceed.)

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/components/ApplicationListRow.tsx src/__tests__/features/applications/ApplicationListRow.test.tsx
git commit -m "feat(applications): row link region plus actions cell"
```

---

### Task 7: ApplicationsList — tailored map, shared drawers, wiring

**Files:**
- Modify: `src/features/applications/components/ApplicationsList.tsx`
- Test: extend `src/__tests__/features/applications/ApplicationListRow.test.tsx` is not enough; add `src/__tests__/features/applications/ApplicationsList.drawers.test.tsx` (create) — light smoke test of selection state via a small extracted reducer.

**Interfaces:**
- Consumes: `useTailoredResumes`, `buildTailoredMap` (Task 4); `ApplicationListRow` (Task 6); `ResumePreviewDrawer` from `@/features/resumes/components/ResumePreviewDrawer`; `CoverLetterForm` from `./CoverLetterForm`; `DashboardDrawer`; `updateApplicationCoverLetterFn` (Task 3); `getResumesFn`, `createResumeFn` (`@/server/resumes`); `useToastStore`; `useNavigate`; `useQueryClient`; `adminKeys`.
- Produces: a single shared drawer set driven by `selected: { slug: string; kind: 'preview-resume' | 'preview-cl' | 'edit-cl' } | null`. Promote-to-saved then navigate to `/resumes/edit/$id`.

To keep `ApplicationsList` under complexity 10, extract the promote-to-saved
helper to `src/features/applications/utils/promote-resume.ts`.

- [ ] **Step 1: Write the failing test (promote-to-saved is idempotent by label)**

```ts
// src/__tests__/features/applications/promote-resume.test.ts
import { describe, it, expect, vi } from 'vitest'
import { resolveResumeId } from '@/features/applications/utils/promote-resume'

describe('resolveResumeId', () => {
  it('reuses an existing resume with the matching label', async () => {
    const getResumes = vi.fn().mockResolvedValue([{ resumeId: 'r1', label: 'Acme — Dev' }])
    const createResume = vi.fn()
    const id = await resolveResumeId({ label: 'Acme — Dev', data: {} as never }, getResumes, createResume)
    expect(id).toBe('r1')
    expect(createResume).not.toHaveBeenCalled()
  })
  it('creates a new resume when no label matches', async () => {
    const getResumes = vi.fn().mockResolvedValue([])
    const createResume = vi.fn().mockResolvedValue({ resumeId: 'r2' })
    const id = await resolveResumeId({ label: 'New — Role', data: {} as never }, getResumes, createResume)
    expect(id).toBe('r2')
    expect(createResume).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/promote-resume.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// src/features/applications/utils/promote-resume.ts
import type { ResumeData } from '@/lib/resumes/resume-data'

interface ResumeLike { readonly resumeId: string; readonly label: string }
type GetResumes = () => Promise<ResumeLike[]>
type CreateResume = (args: { data: { label: string; data: Record<string, unknown> } }) => Promise<{ resumeId: string }>

/** Find a saved resume by deterministic label, else create one. Returns its id. */
export async function resolveResumeId(
  input: { label: string; data: ResumeData },
  getResumes: GetResumes,
  createResume: CreateResume,
): Promise<string> {
  const existing = await getResumes()
  const match = existing.find((r) => r.label === input.label)
  if (match) return match.resumeId
  const created = await createResume({
    data: { label: input.label, data: input.data as unknown as Record<string, unknown> },
  })
  return created.resumeId
}
```

- [ ] **Step 4: Run test**

Run: `yarn test src/__tests__/features/applications/promote-resume.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire ApplicationsList**

Edit `src/features/applications/components/ApplicationsList.tsx`:

(a) Add imports:

```ts
import { useTailoredResumes, buildTailoredMap } from '../hooks/use-tailored-resumes'
import { ResumePreviewDrawer } from '@/features/resumes/components/ResumePreviewDrawer'
import { CoverLetterForm } from './CoverLetterForm'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import { resolveResumeId } from '../utils/promote-resume'
import { getResumesFn, createResumeFn } from '@/server/resumes'
import { updateApplicationCoverLetterFn } from '@/server/applications'
import { useToastStore } from '@/lib/stores/toast-store'
import { useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import type { TailoredResumeSummary } from '@/server/applications'
```

(b) Inside the component, after the existing query hooks, add:

```ts
  const { data: tailoredList } = useTailoredResumes()
  const tailoredMap = buildTailoredMap(tailoredList)
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [selected, setSelected] = useState<{ slug: string; kind: 'preview-resume' | 'preview-cl' | 'edit-cl' } | null>(null)

  const selectedTailored: TailoredResumeSummary | null = selected ? tailoredMap.get(selected.slug) ?? null : null

  const handleEditResume = async (tr: TailoredResumeSummary) => {
    try {
      const id = await resolveResumeId(
        { label: `${tr.targetCompany} — ${tr.targetRole}`, data: tr.data },
        getResumesFn,
        createResumeFn,
      )
      navigate({ to: '/resumes/edit/$id', params: { id } })
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Could not open the resume editor')
    }
  }

  const handleSaveCoverLetter = async (content: string) => {
    if (!selected || !selectedTailored?.coverLetter) return
    const next = { ...selectedTailored.coverLetter, paragraphs: content.split('\n\n').filter(Boolean) }
    await updateApplicationCoverLetterFn({ data: { slug: selected.slug, coverLetter: next } })
    await queryClient.invalidateQueries({ queryKey: adminKeys.applications.all })
    await queryClient.invalidateQueries({ queryKey: adminKeys.applications.tailoredResumes })
    setSelected(null)
    addToast('success', 'Cover letter updated.')
  }
```

(c) Update the column-header grid template to add a trailing actions header (line 155-160):

```tsx
            <div className="hidden grid-cols-[1.5fr_1.5fr_14rem_9rem_auto] items-center gap-4 border-b border-zinc-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:text-zinc-500 sm:grid">
              <span>Company</span>
              <span>Position</span>
              <span>Stage</span>
              <span>Status</span>
              <span className="justify-self-end">Documents</span>
            </div>
```

(d) Replace the row render (line 163-169) with the new prop set:

```tsx
              {paginatedApps.map((app) => {
                const tr = tailoredMap.get(app.slug) ?? null
                return (
                  <ApplicationListRow
                    key={app.slug}
                    app={app}
                    tailored={tr}
                    onOpen={() => navigate({ to: '/applications/$slug', params: { slug: app.slug } })}
                    onPreviewResume={() => setSelected({ slug: app.slug, kind: 'preview-resume' })}
                    onEditResume={() => { if (tr) void handleEditResume(tr) }}
                    onPreviewCoverLetter={() => setSelected({ slug: app.slug, kind: 'preview-cl' })}
                    onEditCoverLetter={() => setSelected({ slug: app.slug, kind: 'edit-cl' })}
                  />
                )
              })}
```

(e) Before the closing `</div>` of the outer wrapper, mount the shared drawers:

```tsx
      <ResumePreviewDrawer
        isOpen={selected?.kind === 'preview-resume' || selected?.kind === 'preview-cl'}
        onClose={() => setSelected(null)}
        resume={selected?.kind === 'preview-resume' && selectedTailored
          ? { resumeId: selectedTailored.slug, label: `${selectedTailored.targetCompany} — ${selectedTailored.targetRole}`, isActive: false, createdAt: selectedTailored.updatedAt, updatedAt: selectedTailored.updatedAt, data: selectedTailored.data as unknown as Record<string, unknown> }
          : null}
        coverLetter={selected?.kind === 'preview-cl' ? selectedTailored?.coverLetter ?? null : null}
        coverLetterProfile={selectedTailored?.data.profile}
        coverLetterCompany={selectedTailored?.targetCompany}
        coverLetterRole={selectedTailored?.targetRole}
        onDownload={() => {}}
        isDownloading={false}
      />

      <DashboardDrawer
        isOpen={selected?.kind === 'edit-cl'}
        onClose={() => setSelected(null)}
        title="Edit Cover Letter"
        description={selectedTailored ? `${selectedTailored.targetCompany} — ${selectedTailored.targetRole}` : ''}
      >
        {selected?.kind === 'edit-cl' && selectedTailored?.coverLetter && (
          <CoverLetterForm
            initialContent={selectedTailored.coverLetter.paragraphs.join('\n\n')}
            onSubmit={handleSaveCoverLetter}
            onCancel={() => setSelected(null)}
          />
        )}
      </DashboardDrawer>
```

Note `ResumePreviewDrawer.resume` is typed `AdminResumeWithData | null` — the inline object above matches that shape. If typecheck complains about the `resume` shape, build it via a small typed helper rather than casting.

- [ ] **Step 6: Run full typecheck + targeted tests**

Run: `yarn typecheck && yarn test src/__tests__/features/applications`
Expected: PASS, 0 type errors. (Tasks 1, 4, 6 now all compile together.)

- [ ] **Step 7: Lint + commit**

```bash
yarn lint
git add src/features/applications/components/ApplicationsList.tsx src/features/applications/utils/promote-resume.ts src/__tests__/features/applications/promote-resume.test.ts
git commit -m "feat(applications): inline resume and cover-letter access in the list"
```

---

### Task 8: Email-gated publish in the detail view

**Files:**
- Modify: `src/features/applications/components/ApplicationActionsMenu.tsx`
- Modify: `src/app/_dashboard/applications/$slug.tsx` (detail route — provide `me.email`)
- Test: `src/__tests__/features/applications/publish-gate.test.ts` (create)

**Interfaces:**
- Consumes: route context `me` (from `_dashboard.tsx` `beforeLoad` → `{ me, isAdmin }`).
- Produces: `ApplicationActionsMenu` gains `readonly canPublish: boolean`; publish handler is wired only when `canPublish`. A pure helper `canPublishResume(email): boolean` checks the allow-list.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/applications/publish-gate.test.ts
import { describe, it, expect } from 'vitest'
import { canPublishResume } from '@/features/applications/components/ApplicationActionsMenu'

describe('canPublishResume', () => {
  it('allows the operator email', () => {
    expect(canPublishResume('lamounier_88@hotmail.com')).toBe(true)
  })
  it('denies any other email', () => {
    expect(canPublishResume('someone@else.com')).toBe(false)
    expect(canPublishResume(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/publish-gate.test.ts`
Expected: FAIL — `canPublishResume` not exported.

- [ ] **Step 3: Implement the gate + thread the prop**

In `ApplicationActionsMenu.tsx`, add the helper (top-level export) and a `canPublish` prop:

```ts
const PUBLISH_ALLOW_LIST = new Set(['lamounier_88@hotmail.com'])

/** Presentation gate for the publish action; admin-api remains the real authority. */
export function canPublishResume(email: string | undefined): boolean {
  return typeof email === 'string' && PUBLISH_ALLOW_LIST.has(email)
}
```

Add `readonly canPublish: boolean` to `ApplicationActionsMenuProps`, and change the publish wiring (line 171):

```tsx
        onPublish={isApplied && hasTailoredResume && canPublish ? () => publishMutation.mutate() : undefined}
```

In `src/app/_dashboard/applications/$slug.tsx`, read `me` from route context and pass the gate. The `_dashboard` route's `beforeLoad` already returns `{ me, isAdmin }`; access it with `Route.useRouteContext()` in the detail route component (or in `ApplicationDetailContainer`, whichever renders `ApplicationActionsMenu`). Thread `canPublish={canPublishResume(me?.email)}` down to `ApplicationActionsMenu`.

If `ApplicationActionsMenu` is rendered inside `ApplicationDetailContainer` (not the route file), add a `canPublish` prop to that container too and pass it through. Use `Route.useRouteContext({ from: '/_dashboard' })` if the context lives on the layout route.

- [ ] **Step 4: Run test + typecheck**

Run: `yarn test src/__tests__/features/applications/publish-gate.test.ts && yarn typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/components/ApplicationActionsMenu.tsx "src/app/_dashboard/applications/$slug.tsx" src/__tests__/features/applications/publish-gate.test.ts
git commit -m "feat(applications): email-gate the publish-to-public action"
```

---

### Task 9: Decommission the Resumes hub + route migration

**Files:**
- Create: `src/app/_dashboard/resumes/route.tsx`, `src/app/_dashboard/resumes/edit.$id/route.tsx`, `src/app/_dashboard/resumes/new/route.tsx`
- Delete: `src/app/_dashboard.resumes.tsx`, `src/app/_dashboard.resumes.edit.$id.tsx`, `src/app/_dashboard.resumes.new.tsx`, `src/features/resumes/components/ResumesDisplayer.tsx`
- Modify: `src/components/layouts/AppLayout.tsx:52`; `src/features/overview/components/DashboardOverview.tsx` (quick-link); `src/features/reports/components/ReportContainer.tsx` (quick-link)

**Interfaces:**
- Consumes: existing `ResumeForm`, `getResumeFn`, `updateResumeFn`, `createResumeFn`, `DashboardDrawer`.
- Produces: `/resumes` becomes a bare `<Outlet/>` host (no page chrome, no nav entry). `/resumes/edit/$id` and `/resumes/new` keep working (reached via the list's promote-to-edit and any direct nav).

`/resumes` is no longer navigable as a page. Its only job is hosting the edit/new
drawers reached from Applications.

- [ ] **Step 1: Create the directory route host**

```tsx
// src/app/_dashboard/resumes/route.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_dashboard/resumes')({
  component: () => <Outlet />,
})
```

- [ ] **Step 2: Create the edit route (directory form)**

Copy the body of the old `_dashboard.resumes.edit.$id.tsx` verbatim into
`src/app/_dashboard/resumes/edit.$id/route.tsx`, changing ONLY the route path
string to match directory form:

```ts
export const Route = createFileRoute('/_dashboard/resumes/edit/$id')({
  component: EditResumePage,
})
```

Fix the relative imports for the new depth (`../../../features/...` →
use the `@/` alias instead, e.g. `import { ResumeForm } from '@/features/resumes/components/ResumeForm'`,
`import { getResumeFn, updateResumeFn } from '@/server/resumes'`,
`import { DashboardDrawer } from '@/components/ui/DashboardDrawer'`). Keep all
`navigate({ to: '/resumes' })` calls as-is (the URL is unchanged).

- [ ] **Step 3: Create the new route (directory form)**

Copy the old `_dashboard.resumes.new.tsx` body into
`src/app/_dashboard/resumes/new/route.tsx`, route path:

```ts
export const Route = createFileRoute('/_dashboard/resumes/new')({
  component: CreateResumePage,
})
```

Convert relative imports to `@/` alias as in Step 2.

- [ ] **Step 4: Delete the flat route files + ResumesDisplayer**

```bash
git rm src/app/_dashboard.resumes.tsx src/app/_dashboard.resumes.edit.\$id.tsx src/app/_dashboard.resumes.new.tsx src/features/resumes/components/ResumesDisplayer.tsx
```

- [ ] **Step 5: Remove the nav entry**

In `src/components/layouts/AppLayout.tsx`, delete line 52:

```ts
  { name: "Resumes",         href: "/resumes",       icon: DocumentTextIcon,      adminOnly: false },
```

If `DocumentTextIcon` is now unused in the file, remove its import (typecheck/lint will flag it).

- [ ] **Step 6: Remove the quick-links**

In `src/features/overview/components/DashboardOverview.tsx`, delete the
`{ label: 'Manage Resumes', href: '/resumes', ... }` entry from the `quickActions`
array. Do the same in `src/features/reports/components/ReportContainer.tsx`.
`totalResumes` may become unused in one or both — remove the now-dead variable
and its source (lint/typecheck will flag it).

- [ ] **Step 7: Regenerate route tree + full verify**

Run: `yarn dev` briefly to regenerate `routeTree.gen.ts` (or it regenerates on build), then stop it. Then:

Run: `yarn typecheck && yarn lint && yarn test`
Expected: 0 type errors, 0 lint errors, all tests pass. Confirm `routeTree.gen.ts`
now contains `/_dashboard/resumes/edit/$id` and `/_dashboard/resumes/new` and no
longer references `ResumesDisplayer`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(resumes): retire the standalone Resumes hub; migrate routes to drawer host"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `yarn typecheck && yarn lint && yarn test && yarn workspace admin-api test`
Expected: all green.

- [ ] **Step 2: Manual golden path (`yarn dev`, port 5001)**

- Sidebar shows **Job Applications**, no **Resumes** entry.
- Open `/applications/list`: rows with a tailored resume show Preview + Edit resume icons; rows with a cover letter also show the two cover-letter icons; rows without show none.
- Preview Resume opens the drawer with the resume; Preview Cover Letter shows the letter.
- Edit Resume navigates to `/resumes/edit/<id>` (promote-to-saved); editing the same application twice reuses the same saved record (check the resumes list does not grow a duplicate).
- Edit Cover Letter saves; reopening shows the edited text (override round-trip).
- Detail view (`?stage=applied`): publish option appears only when signed in as the gated operator email; absent otherwise.
- `/overview` and `/reports`: no "Manage Resumes" quick-link; no broken layout where it was.

- [ ] **Step 3: Edge case**

- An application with no tailored resume shows zero action icons and the row link still opens the detail page.
- Cover-letter save failure (simulate by stopping admin-api): a toast appears and the drawer stays open.

- [ ] **Step 4: Finish the branch**

Invoke `superpowers:finishing-a-development-branch` to choose merge/PR/cleanup.

---

## Self-Review

**Spec coverage:**
- §1 data flow (coverLetter on summary, one fetch, slug map) → Tasks 1, 4, 7. ✅
- §2 row restructure (link region + actions cell, grid template, header) → Tasks 6, 7. ✅
- §3 ApplicationRowActions (Eye/Pencil/FileText/PenLine, presence-gated, shared drawer state) → Tasks 5, 7. ✅
- §4 promote-to-saved-then-edit (idempotent by label) → Task 7 (`resolveResumeId`). ✅
- §5 publish email-gate → Task 8. ✅
- §6 cover-letter override (admin-api route + storage + read-merge + client fn + form wiring) → Tasks 2, 3, 7. Schema already provisioned (migration 103) — noted, no migration task. ✅
- §7 decommission + route migration (dir routes, nav entry, quick-links, delete ResumesDisplayer) → Task 9. ✅
- Testing section → tests in every task + Task 10. ✅

**Drift from spec recorded:** `getTailoredResumesFn` already exists and is consumed by `ResumesDisplayer` (extended, not created); cover-letter override **column** already exists via migration 103 (wired, not created). The spec's "fallback to preview-only if schema work undesirable" is moot — schema is done, so full cover-letter edit is in scope.

**Placeholder scan:** none — every code step shows real code.

**Type consistency:** `TailoredResumeSummary.coverLetter` (Task 1) consumed identically in Tasks 4/5/7. `resolveResumeId` signature (Task 7) matches its test. `canPublishResume` (Task 8) matches its test. `updateApplicationCoverLetterFn` body `{ slug, coverLetter }` (Task 3) matches the admin-api route body `{ coverLetter }` + path slug (Task 2).

**Open risk to flag at execution:** the `<Link className="contents">` approach in Task 6 (Step 3 note) and the inline `resume` object shape for `ResumePreviewDrawer` in Task 7 (Step 5 note) are the two spots most likely to need a small adjustment during implementation; both have a documented fallback.
