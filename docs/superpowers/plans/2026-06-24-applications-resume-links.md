# Applications Resume & Cover-Letter Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Preview/Edit for each application's tailored resume and cover letter inline in the Job Applications list, make builder edits actually persist, gate Publish to one operator, and retire the standalone Resumes hub.

**Architecture:** `getTailoredResumesFn` already loads full detail per app server-side — extend it to also carry the cover letter, so list rows hold everything needed. Editing reuses the existing `ResumeBuilderApp` (Resume/Cover tabs) wrapped in a shared `ResumeBuilderDrawer` that adds a real Save: resume → upsert a saved-resume record by label; cover letter → a new admin-api overrides column merged at read time (analysis is immutable pipeline output). Resumes routes migrate to directory form; the hub page becomes a bare outlet host.

**Tech Stack:** TanStack Start/Router/Query, React 19, Zod, Tailwind v4, Vitest, Hono (admin-api), Postgres (RLS via `withUser`).

## Global Constraints

- Package manager: **Yarn 4 only** (`yarn add`, `yarn workspace admin-api add`, never npm/npx). Verify gate: `yarn typecheck && yarn lint && yarn test`.
- Prose/copy: **English (UK)**, no non-ASCII diacritics; product name **Tucaken**; document term is **resume**.
- Lint: cyclomatic complexity ≤ **10**; no nested ternaries (S3358) — guard clauses/early returns; `Set.has()` for allow-lists (S7776); `crypto.randomUUID()` not `Math.random()` (S2245); `Number.parseInt`/`isNaN` (S7773); optional chaining over `&&` (S6582); no `console.*` in app code (use Pino); stable React keys, never index (S6479); no `as any`.
- New components: TailwindPlus-first; palette tokens from `src/styles.css @theme`; default corner radius `rounded-md`; render correctly in light + dark.
- New routes: **directory-based only** (`src/app/_dashboard/<seg>/route.tsx`); never edit `routeTree.gen.ts` or `yarn.lock` by hand.
- Server boundaries validate input with **Zod**; no `process.env` in client components.
- Email gate value (verbatim): `lamounier_88@hotmail.com`.
- Run all commands from the worktree root: `/Users/nelsonlamounier/Desktop/portfolio/tucaken-app/.claude/worktrees/feat+applications-resume-links`.

---

## File Structure

**admin-api + DB (sibling migrations repo)**
- Create: `/Users/nelsonlamounier/Desktop/portfolio/ai-applications/applications/platform-rds-bootstrap/migrations/103_application_cover_letter_override.sql`
- Modify: `admin-api/src/lib/repositories/applications.ts` (interface field, row mapping, new repo fn)
- Modify: `admin-api/src/routes/applications.ts` (read-merge in `GET /:slug`, new `PUT /:slug/cover-letter`)

**Client server layer**
- Modify: `src/server/applications.ts` (`TailoredResumeSummary.coverLetter`, `getTailoredResumesFn`, new `updateApplicationCoverLetterFn`)
- Modify: `src/lib/api/query-keys.ts` (`adminKeys.applications.tailoredResumes`)

**Editing surface**
- Modify: `src/features/applications/utils/resume-adapters.ts` (reverse adapters)
- Modify: `src/features/resume-theme/app/main.tsx` (optional `onSave` in `TopBar`)
- Create: `src/features/applications/components/ResumeBuilderDrawer.tsx` (shared edit drawer + Save)

**List UI**
- Create: `src/features/applications/components/ApplicationRowActions.tsx`
- Modify: `src/features/applications/components/ApplicationListRow.tsx` (a11y restructure)
- Modify: `src/features/applications/components/ApplicationsList.tsx` (tailored map + shared drawers)

**Detail menu**
- Modify: `src/features/applications/components/ApplicationActionsMenu.tsx` (reuse drawer + email-gated publish)
- Modify: `src/app/_dashboard.applications.$slug.tsx` (thread `me.email` into the menu)

**Decommission + route migration**
- Create: `src/app/_dashboard/resumes/route.tsx`, `src/app/_dashboard/resumes/edit.$id/route.tsx`, `src/app/_dashboard/resumes/new/route.tsx`
- Delete: `src/app/_dashboard.resumes.tsx`, `src/app/_dashboard.resumes.edit.$id.tsx`, `src/app/_dashboard.resumes.new.tsx`, `src/features/resumes/components/ResumesDisplayer.tsx`, `src/features/applications/components/CoverLetterForm.tsx`
- Modify: `src/components/layouts/AppLayout.tsx` (remove nav entry), `src/features/overview/components/DashboardOverview.tsx` + `src/features/reports/components/ReportContainer.tsx` (remove "Manage Resumes" quick links)

---

## Task 1: DB migration — cover-letter override column

**Files:**
- Create: `/Users/nelsonlamounier/Desktop/portfolio/ai-applications/applications/platform-rds-bootstrap/migrations/103_application_cover_letter_override.sql`

**Interfaces:**
- Produces: `job_applications.cover_letter_override JSONB NOT NULL DEFAULT 'null'::jsonb` — read by Task 2/3.

- [ ] **Step 1: Confirm 103 is the next free number**

Run: `ls /Users/nelsonlamounier/Desktop/portfolio/ai-applications/applications/platform-rds-bootstrap/migrations/ | sort | tail -3`
Expected: highest is `102_projects_post_sync_action.sql` (so `103_` is free). If a `103_*` already exists, bump to the next free number and use it consistently in this task.

- [ ] **Step 2: Write the migration (idempotent, matches house style)**

```sql
-- 103_application_cover_letter_override.sql — per-application cover-letter override. Idempotent.
--
-- The tailored cover letter is immutable pipeline output (pipeline_runs.metadata.analysis.coverLetter).
-- To let a user edit it without mutating pipeline provenance, store an override JSON on the
-- application; the detail read prefers the override when non-null. Shape matches the CoverLetter
-- type { greeting, paragraphs[], signoff{name,email,linkedin,github} }. Default 'null' = no override.
--
-- No new RLS policy: job_applications already enforces owner-scoped RLS, and writes go through the
-- same withUser(...) role/current_user_id context as status/annotation updates.

BEGIN;

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS cover_letter_override JSONB NOT NULL DEFAULT 'null'::jsonb;

COMMIT;
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/nelsonlamounier/Desktop/portfolio/ai-applications add applications/platform-rds-bootstrap/migrations/103_application_cover_letter_override.sql
git -C /Users/nelsonlamounier/Desktop/portfolio/ai-applications commit -m "feat(db): add job_applications.cover_letter_override for editable cover letters"
```

Note: migrations are applied by the platform's migration runner, not in this PR. No test step — column add is idempotent.

---

## Task 2: admin-api repository — field, mapping, writer

**Files:**
- Modify: `admin-api/src/lib/repositories/applications.ts`

**Interfaces:**
- Consumes: `Queryable` (existing), `job_applications.cover_letter_override` (Task 1).
- Produces:
  - `Application.coverLetterOverride: Record<string, unknown> | null`
  - `updateApplicationCoverLetterOverride(pool: Queryable, id: string, coverLetter: Record<string, unknown> | null): Promise<void>`

- [ ] **Step 1: Add the field to the `Application` interface**

Find the `Application` interface (the type returned by `getApplication`, where `userAnnotations` is declared) and add beside it:

```typescript
  coverLetterOverride: Record<string, unknown> | null
```

- [ ] **Step 2: Select + map the column in `rowToApplication` (and the `getApplication` SELECT)**

In the `SELECT ... FROM job_applications` used by `getApplication`, add `cover_letter_override` to the column list (next to `user_annotations`). In `rowToApplication` (the row→object mapper), add:

```typescript
    coverLetterOverride: (row.cover_letter_override ?? null) as Record<string, unknown> | null,
```

- [ ] **Step 3: Add the writer function (mirrors `updateApplicationAnnotations`)**

Append next to `updateApplicationAnnotations`:

```typescript
export async function updateApplicationCoverLetterOverride(
    pool: Queryable,
    id: string,
    coverLetter: Record<string, unknown> | null,
): Promise<void> {
    await pool.query(
        `UPDATE job_applications SET cover_letter_override = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [id, JSON.stringify(coverLetter)],
    );
}
```

- [ ] **Step 4: Typecheck the workspace**

Run: `yarn workspace admin-api run typecheck` (or from repo root `yarn typecheck` if admin-api is included)
Expected: PASS (no usages yet beyond the new field).

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/repositories/applications.ts
git commit -m "feat(admin-api): repository support for cover_letter_override"
```

---

## Task 3: admin-api handler + read-merge

**Files:**
- Modify: `admin-api/src/routes/applications.ts`

**Interfaces:**
- Consumes: `updateApplicationCoverLetterOverride`, `Application.coverLetterOverride` (Task 2); `getApplication`, `withUser`, `getPool`, `config` (existing).
- Produces: `PUT /api/admin/applications/:slug/cover-letter`; `GET /:slug` response `coverLetter` now prefers the override.

- [ ] **Step 1: Import the new repository fn**

Add `updateApplicationCoverLetterOverride` to the existing import from `../lib/repositories/...` that already pulls `updateApplicationAnnotations`.

- [ ] **Step 2: Prefer the override in the detail read**

Locate `coverLetter: rawAnalysis['coverLetter'] ?? null,` (≈ line 467) and replace with:

```typescript
        coverLetter:       (application.coverLetterOverride ?? rawAnalysis['coverLetter'] ?? null),
```

(`application` is the `getApplication(db, slug)` result already in scope for this read.)

- [ ] **Step 3: Add the write handler (mirrors `PATCH /:slug/annotations`)**

Add beside the annotations handler:

```typescript
  app.put('/:slug/cover-letter', async (ctx) => {
    const userId = ctx.get('userId');
    if (!userId) return ctx.json({ error: 'Unauthorized' }, 401);

    const slug = ctx.req.param('slug');

    let body: { coverLetter?: unknown };
    try { body = await ctx.req.json(); }
    catch { return ctx.json({ error: 'Body must be valid JSON' }, 400); }

    const coverLetter = (body.coverLetter ?? null) as Record<string, unknown> | null;

    return withUser(getPool(config), userId, async (db) => {
      const application = await getApplication(db, slug);
      if (!application) return ctx.json({ error: `Application not found: ${slug}` }, 404);

      await updateApplicationCoverLetterOverride(db, application.id, coverLetter);
      return ctx.json({ success: true });
    });
  });
```

- [ ] **Step 4: Typecheck**

Run: `yarn workspace admin-api run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/routes/applications.ts
git commit -m "feat(admin-api): PUT /:slug/cover-letter + read-merge override"
```

---

## Task 4: Client server fns — carry cover letter + persist override

**Files:**
- Modify: `src/server/applications.ts`
- Modify: `src/lib/api/query-keys.ts`
- Test: `src/__tests__/server/applications-tailored.test.ts` (create)

**Interfaces:**
- Consumes: admin-api `PUT /:slug/cover-letter` (Task 3); `CoverLetter` type from `@/lib/types/applications.types`; `apiFetch`, `requireAuth` (existing).
- Produces:
  - `TailoredResumeSummary.coverLetter: CoverLetter | null`
  - `updateApplicationCoverLetterFn({ data: { slug: string; coverLetter: CoverLetter | null } })`
  - `adminKeys.applications.tailoredResumes`

- [ ] **Step 1: Add the centralised query key**

In `src/lib/api/query-keys.ts`, inside `applications`, add after `scheduledInterviews`:

```typescript
    /** Tailored resumes (+ cover letters) extracted from applications */
    tailoredResumes: ['admin', 'applications', 'tailored-resumes'] as const,
```

- [ ] **Step 2: Extend `TailoredResumeSummary` and populate `coverLetter`**

In `src/server/applications.ts`, ensure `CoverLetter` is imported from `@/lib/types/applications.types`. Add to the `TailoredResumeSummary` interface:

```typescript
  readonly coverLetter: CoverLetter | null
```

In `getTailoredResumesFn`, in the `tailored.push({ ... })` call, add:

```typescript
        coverLetter: result.value.application.analysis.coverLetter ?? null,
```

- [ ] **Step 3: Write the failing test for the persist fn shape**

Create `src/__tests__/server/applications-tailored.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { CoverLetter } from '@/lib/types/applications.types'

// Pure shape guard: the body we send to admin-api must be { coverLetter }.
function buildCoverLetterBody(coverLetter: CoverLetter | null) {
  return JSON.stringify({ coverLetter })
}

describe('cover-letter persist body', () => {
  it('wraps the cover letter under a coverLetter key', () => {
    const cl: CoverLetter = {
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['One.', 'Two.'],
      signoff: { name: 'Nelson', email: 'n@x.com', linkedin: '', github: '' },
    }
    expect(JSON.parse(buildCoverLetterBody(cl))).toEqual({ coverLetter: cl })
  })

  it('allows null to clear the override', () => {
    expect(JSON.parse(buildCoverLetterBody(null))).toEqual({ coverLetter: null })
  })
})
```

- [ ] **Step 4: Run the test — expect FAIL (file under test not wired)**

Run: `yarn test src/__tests__/server/applications-tailored.test.ts`
Expected: initially FAIL only if import path is wrong; the helper is inline so it should PASS once the import resolves. If it PASSES immediately, that is acceptable — it pins the body contract used by Step 5.

- [ ] **Step 5: Add `updateApplicationCoverLetterFn`**

In `src/server/applications.ts` add (Zod-validated to the `CoverLetter` shape; `z` is already imported):

```typescript
const coverLetterSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  signoff: z.object({
    name: z.string(),
    email: z.string(),
    linkedin: z.string(),
    github: z.string(),
  }),
})

const updateCoverLetterSchema = z.object({
  slug: z.string().min(1),
  coverLetter: coverLetterSchema.nullable(),
})

export const updateApplicationCoverLetterFn = createServerFn({ method: 'POST' })
  .inputValidator(updateCoverLetterSchema)
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

- [ ] **Step 6: Run tests + typecheck**

Run: `yarn test src/__tests__/server/applications-tailored.test.ts && yarn typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/applications.ts src/lib/api/query-keys.ts src/__tests__/server/applications-tailored.test.ts
git commit -m "feat(applications): server carries cover letter + persists override"
```

---

## Task 5: Reverse adapters (builder state → ResumeData / CoverLetter)

**Files:**
- Modify: `src/features/applications/utils/resume-adapters.ts`
- Test: `src/__tests__/features/applications/resume-adapters.test.ts` (create)

**Interfaces:**
- Consumes: `AppState`, `ResumeData as BuilderResumeData`, `CoverLetterData` from builder state; `ResumeData as AppResumeData`, `CoverLetter`, `CoverLetterSignoff` from app types.
- Produces:
  - `builderStateToResumeData(state: AppState): AppResumeData`
  - `builderStateToCoverLetter(state: AppState, fallbackSignoff: CoverLetterSignoff): CoverLetter`

- [ ] **Step 1: Write the failing round-trip test**

Create `src/__tests__/features/applications/resume-adapters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  mapApplicationToBuilderState,
  builderStateToResumeData,
  builderStateToCoverLetter,
} from '@/features/applications/utils/resume-adapters'
import type { ResumeData } from '@/lib/resumes/resume-data'
import type { CoverLetter } from '@/lib/types/applications.types'

const resume: ResumeData = {
  profile: { name: 'Nelson', title: 'SWE', location: 'London', email: 'n@x.com', linkedin: 'li', github: 'gh', website: 'w' },
  summary: 'Sum.',
  keyAchievements: [],
  experience: [{ title: 'Eng', company: 'Acme', period: '2024', highlights: ['Did a thing'] } as never],
  certifications: [],
  skills: [{ category: 'Lang', skills: ['TS', 'Go'] } as never],
  education: [],
  projects: [],
}

const coverLetter: CoverLetter = {
  greeting: 'Dear Hiring Manager,',
  paragraphs: ['First para.', 'Second para.'],
  signoff: { name: 'Nelson', email: 'n@x.com', linkedin: 'li', github: 'gh' },
}

describe('reverse adapters', () => {
  it('round-trips resume summary + experience + skills', () => {
    const state = mapApplicationToBuilderState(resume, coverLetter, 'Acme', 'SWE')
    const back = builderStateToResumeData(state)
    expect(back.summary).toBe('Sum.')
    expect(back.experience[0].title).toBe('Eng')
    expect(back.experience[0].highlights).toEqual(['Did a thing'])
    expect(back.skills[0].skills).toEqual(['TS', 'Go'])
  })

  it('round-trips cover letter greeting + paragraphs, preserves fallback signoff', () => {
    const state = mapApplicationToBuilderState(resume, coverLetter, 'Acme', 'SWE')
    const back = builderStateToCoverLetter(state, coverLetter.signoff)
    expect(back.greeting).toBe('Dear Hiring Manager,')
    expect(back.paragraphs).toEqual(['First para.', 'Second para.'])
    expect(back.signoff).toEqual(coverLetter.signoff)
  })
})
```

- [ ] **Step 2: Run — expect FAIL (functions not exported)**

Run: `yarn test src/__tests__/features/applications/resume-adapters.test.ts`
Expected: FAIL ("builderStateToResumeData is not a function").

- [ ] **Step 3: Implement the reverse adapters**

Append to `src/features/applications/utils/resume-adapters.ts` (import `CoverLetterSignoff` from `@/lib/types/applications.types`, and `AppState` is already imported):

```typescript
import type { CoverLetterSignoff } from '@/lib/types/applications.types'

/** Builder AppState → application ResumeData (inverse of mapApplicationToBuilderState). */
export function builderStateToResumeData(state: AppState): AppResumeData {
  const r = state.resume
  return {
    profile: {
      name: r.profile.name,
      title: r.profile.title,
      location: r.profile.location,
      email: r.profile.email,
      linkedin: r.profile.linkedin,
      github: r.profile.github,
      website: r.profile.website,
    },
    summary: r.summary,
    keyAchievements: [],
    experience: r.experience.map((e) => ({
      title: e.title,
      company: e.company,
      period: e.period,
      highlights: e.bullets,
    })) as AppResumeData['experience'],
    certifications: r.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      year: c.year,
    })) as AppResumeData['certifications'],
    skills: r.skills.map((s) => ({
      category: s.category,
      skills: s.skills.split(',').map((t) => t.trim()).filter(Boolean),
    })) as AppResumeData['skills'],
    education: r.education.map((e) => ({
      degree: e.degree,
      institution: e.institution,
      period: e.period,
      details: e.details,
    })) as AppResumeData['education'],
    projects: r.projects.map((p) => ({
      name: p.name,
      github: p.url,
      description: p.description,
    })) as AppResumeData['projects'],
    sectionOrder: r.sectionOrder,
  }
}

/**
 * Builder AppState → CoverLetter. Greeting + paragraphs come from the builder's
 * edited cover; the structured signoff is preserved from the original (the builder
 * exposes signoff only as a freetext `closing`, so we do not parse it back).
 */
export function builderStateToCoverLetter(
  state: AppState,
  fallbackSignoff: CoverLetterSignoff,
): CoverLetter {
  const paragraphs = state.cover.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return {
    greeting: state.cover.greeting,
    paragraphs,
    signoff: fallbackSignoff,
  }
}
```

Note: if the existing file already imports from `@/lib/types/applications.types`, merge `CoverLetterSignoff` into that import rather than adding a duplicate import line (lint).

- [ ] **Step 4: Run — expect PASS**

Run: `yarn test src/__tests__/features/applications/resume-adapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
yarn typecheck
git add src/features/applications/utils/resume-adapters.ts src/__tests__/features/applications/resume-adapters.test.ts
git commit -m "feat(applications): reverse adapters for builder state"
```

---

## Task 6: Builder Save action

**Files:**
- Modify: `src/features/resume-theme/app/main.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ResumeBuilderApp` accepts `onSave?: () => void`; when provided, a **Save** button renders in `TopBar` left of the Download menu.

- [ ] **Step 1: Thread the prop through `ResumeBuilderApp` and `TopBar`**

Change the signature:

```typescript
export function ResumeBuilderApp({ onClose, onSave }: { onClose?: () => void; onSave?: () => void } = {}) {
```

Pass it down: `<TopBar state={state} theme={theme} view={view} margins={margins} onClose={onClose} onSave={onSave} />` and add `onSave?: () => void;` to `TopBar`'s prop type.

- [ ] **Step 2: Render the Save button (before the Download `<Menu>`)**

Inside `TopBar`'s right-hand `div`, immediately before the Download `<Menu as="div" ...>`:

```tsx
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-x-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-500 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            Save
          </button>
        )}
```

- [ ] **Step 3: Typecheck**

Run: `yarn typecheck`
Expected: PASS (existing callers pass no `onSave`).

- [ ] **Step 4: Commit**

```bash
git add src/features/resume-theme/app/main.tsx
git commit -m "feat(resume-builder): optional Save action in TopBar"
```

---

## Task 7: Shared `ResumeBuilderDrawer` (load + persist)

**Files:**
- Create: `src/features/applications/components/ResumeBuilderDrawer.tsx`

**Interfaces:**
- Consumes: `DashboardDrawer`; `ResumeBuilderApp` (Task 6); `mapApplicationToBuilderState`, `builderStateToResumeData`, `builderStateToCoverLetter` (Task 5); builder state `getState/setState/enterEphemeralMode/exitEphemeralMode/setView`; `getResumesFn/createResumeFn/updateResumeFn` (`@/server/resumes`); `updateApplicationCoverLetterFn` (Task 4); `useToastStore`; `adminKeys`.
- Produces: `<ResumeBuilderDrawer isOpen onClose resume coverLetter company role slug initialView? />` — a self-contained edit surface used by list rows and the detail menu.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import { ResumeBuilderApp } from '@/features/resume-theme/app/main'
import {
  getState, setState, enterEphemeralMode, exitEphemeralMode, setView,
  type AppState,
} from '@/features/resume-theme/app/state'
import {
  mapApplicationToBuilderState,
  builderStateToResumeData,
  builderStateToCoverLetter,
} from '../utils/resume-adapters'
import { getResumesFn, createResumeFn, updateResumeFn } from '@/server/resumes'
import { updateApplicationCoverLetterFn } from '@/server/applications'
import type { ResumeData } from '@/lib/resumes/resume-data'
import type { CoverLetter } from '@/lib/types/applications.types'
import { useToastStore } from '@/lib/stores/toast-store'
import { adminKeys } from '@/lib/api/query-keys'

interface ResumeBuilderDrawerProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly resume: ResumeData
  readonly coverLetter: CoverLetter | null
  readonly company: string
  readonly role: string
  readonly slug: string
  readonly initialView?: 'resume' | 'cover'
}

export function ResumeBuilderDrawer({
  isOpen, onClose, resume, coverLetter, company, role, slug, initialView = 'resume',
}: ResumeBuilderDrawerProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [builderKey, setBuilderKey] = useState(0)
  const prevStateRef = useRef<AppState | null>(null)

  // Load builder state when the drawer opens; restore + exit ephemeral on close/unmount.
  useEffect(() => {
    if (!isOpen) return
    prevStateRef.current = getState()
    enterEphemeralMode()
    setState(() => mapApplicationToBuilderState(resume, coverLetter, company, role))
    setView(initialView)
    setBuilderKey((k) => k + 1)
  }, [isOpen, resume, coverLetter, company, role, initialView])

  const restore = useCallback(() => {
    if (prevStateRef.current) {
      const prev = prevStateRef.current
      setState(() => prev)
      prevStateRef.current = null
    }
    exitEphemeralMode()
  }, [])

  useEffect(() => () => { restore() }, [restore])

  const handleClose = useCallback(() => {
    restore()
    onClose()
  }, [restore, onClose])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const state = getState()
      const label = `${company} — ${role}`
      const existing = await getResumesFn()
      const match = existing.find((r) => r.label === label)
      const resumeData = builderStateToResumeData(state) as unknown as Record<string, unknown>
      if (match) {
        await updateResumeFn({ data: { resumeId: match.resumeId, label, data: resumeData } })
      } else {
        await createResumeFn({ data: { label, data: resumeData } })
      }
      if (coverLetter) {
        await updateApplicationCoverLetterFn({
          data: { slug, coverLetter: builderStateToCoverLetter(state, coverLetter.signoff) },
        })
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.resumes.all })
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.all })
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.tailoredResumes })
      addToast('success', 'Saved.')
      handleClose()
    },
    onError: (err: Error) => addToast('error', err.message),
  })

  if (!isOpen) return null

  return (
    <DashboardDrawer
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Tailored Resume"
      description={`${company} — ${role}`}
      unstyledContent
      fullBleed
      modal={false}
    >
      <ResumeBuilderApp
        key={builderKey}
        onClose={handleClose}
        onSave={() => saveMutation.mutate()}
      />
    </DashboardDrawer>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`
Expected: PASS. If `DashboardDrawer` prop names differ (`isOpen`/`onClose`/`unstyledContent`/`fullBleed`/`modal`), align with its actual signature — copy them from `ApplicationActionsMenu.tsx` which already uses it.

- [ ] **Step 3: Commit**

```bash
git add src/features/applications/components/ResumeBuilderDrawer.tsx
git commit -m "feat(applications): shared ResumeBuilderDrawer with real save"
```

---

## Task 8: `ApplicationRowActions`

**Files:**
- Create: `src/features/applications/components/ApplicationRowActions.tsx`
- Test: `src/__tests__/features/applications/ApplicationRowActions.test.tsx` (create)

**Interfaces:**
- Consumes: `TailoredResumeSummary` (extended, Task 4); lucide icons.
- Produces: `<ApplicationRowActions tailored onPreviewResume onPreviewCoverLetter onEdit />` where `onEdit(initialView)` opens the builder. Renders cover-letter buttons only when `tailored.coverLetter` is non-null.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/applications/ApplicationRowActions.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationRowActions } from '@/features/applications/components/ApplicationRowActions'
import type { TailoredResumeSummary } from '@/server/applications'

const base: TailoredResumeSummary = {
  slug: 'a', targetCompany: 'Acme', targetRole: 'SWE', updatedAt: '2026-01-01',
  data: {} as never, coverLetter: null,
}

describe('ApplicationRowActions', () => {
  it('shows resume buttons but no cover-letter buttons when coverLetter is null', () => {
    render(<ApplicationRowActions tailored={base} onPreviewResume={vi.fn()} onPreviewCoverLetter={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByLabelText('Preview resume')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit resume')).toBeInTheDocument()
    expect(screen.queryByLabelText('Preview cover letter')).toBeNull()
    expect(screen.queryByLabelText('Edit cover letter')).toBeNull()
  })

  it('shows cover-letter buttons when coverLetter is present', () => {
    const tr = { ...base, coverLetter: { greeting: 'Hi', paragraphs: [], signoff: { name: '', email: '', linkedin: '', github: '' } } }
    render(<ApplicationRowActions tailored={tr} onPreviewResume={vi.fn()} onPreviewCoverLetter={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByLabelText('Preview cover letter')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit cover letter')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect FAIL (component missing)**

Run: `yarn test src/__tests__/features/applications/ApplicationRowActions.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

```tsx
import { Eye, Pencil, FileText, PenLine } from 'lucide-react'
import type { TailoredResumeSummary } from '@/server/applications'

interface ApplicationRowActionsProps {
  readonly tailored: TailoredResumeSummary
  readonly onPreviewResume: () => void
  readonly onPreviewCoverLetter: () => void
  readonly onEdit: (initialView: 'resume' | 'cover') => void
}

const BTN =
  'inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100 transition-colors'

export function ApplicationRowActions({
  tailored, onPreviewResume, onPreviewCoverLetter, onEdit,
}: ApplicationRowActionsProps) {
  const hasCoverLetter = tailored.coverLetter !== null
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" aria-label="Preview resume" title="Preview resume" className={BTN} onClick={onPreviewResume}>
        <Eye className="size-4" />
      </button>
      <button type="button" aria-label="Edit resume" title="Edit resume" className={BTN} onClick={() => onEdit('resume')}>
        <Pencil className="size-4" />
      </button>
      {hasCoverLetter && (
        <button type="button" aria-label="Preview cover letter" title="Preview cover letter" className={BTN} onClick={onPreviewCoverLetter}>
          <FileText className="size-4" />
        </button>
      )}
      {hasCoverLetter && (
        <button type="button" aria-label="Edit cover letter" title="Edit cover letter" className={BTN} onClick={() => onEdit('cover')}>
          <PenLine className="size-4" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `yarn test src/__tests__/features/applications/ApplicationRowActions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/components/ApplicationRowActions.tsx src/__tests__/features/applications/ApplicationRowActions.test.tsx
git commit -m "feat(applications): ApplicationRowActions inline buttons"
```

---

## Task 9: Refactor `ApplicationListRow` for a11y + actions cell

**Files:**
- Modify: `src/features/applications/components/ApplicationListRow.tsx`

**Interfaces:**
- Consumes: `ApplicationSummary`; `TailoredResumeSummary` (optional); `ApplicationRowActions` (Task 8); `StatusBadge`, `StageProgressTrack` (existing); `Link` from `@tanstack/react-router`.
- Produces: `<ApplicationListRow app tailored? onPreviewResume onPreviewCoverLetter onEdit />` — info region is a `<Link>`, actions live in a separate cell (no nested buttons).

- [ ] **Step 1: Rewrite the component**

```tsx
import { Link } from '@tanstack/react-router'
import type { ApplicationSummary } from '@/lib/types/applications.types'
import type { TailoredResumeSummary } from '@/server/applications'
import { StatusBadge } from './StatusBadge'
import { StageProgressTrack } from './StageProgressTrack'
import { ApplicationRowActions } from './ApplicationRowActions'

interface ApplicationListRowProps {
  readonly app: ApplicationSummary
  readonly tailored?: TailoredResumeSummary
  readonly onPreviewResume: (tr: TailoredResumeSummary) => void
  readonly onPreviewCoverLetter: (tr: TailoredResumeSummary) => void
  readonly onEdit: (tr: TailoredResumeSummary, initialView: 'resume' | 'cover') => void
}

/**
 * One application row: a link region (company / role / progress / status) plus a
 * separate actions cell with inline resume + cover-letter buttons. Actions are a
 * sibling of the link — never nested inside it — to keep the markup accessible.
 */
export function ApplicationListRow({
  app, tailored, onPreviewResume, onPreviewCoverLetter, onEdit,
}: ApplicationListRowProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 sm:grid-cols-[1.5fr_1.5fr_12rem_8rem_auto] sm:items-center sm:gap-4">
      <Link
        to="/applications/$slug"
        params={{ slug: app.slug }}
        className="contents text-left"
      >
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{app.targetCompany}</span>
        <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{app.targetRole}</span>
        <StageProgressTrack current={app.interviewStage} />
        <div className="justify-self-start">
          <StatusBadge status={app.status} />
        </div>
      </Link>
      <div className="justify-self-end">
        {tailored && (
          <ApplicationRowActions
            tailored={tailored}
            onPreviewResume={() => onPreviewResume(tailored)}
            onPreviewCoverLetter={() => onPreviewCoverLetter(tailored)}
            onEdit={(view) => onEdit(tailored, view)}
          />
        )}
      </div>
    </div>
  )
}
```

Note: `className="contents"` makes the `<Link>` lay its children directly onto the parent grid so the column template still applies. If `contents` causes hover/focus issues in practice, fall back to giving the `<Link>` `col-span-4 grid grid-cols-subgrid` — verify visually in Task 10's `yarn dev` check.

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`
Expected: FAIL in `ApplicationsList.tsx` (old `onClick` prop no longer exists) — fixed in Task 10. This is expected; proceed.

- [ ] **Step 3: Commit**

```bash
git add src/features/applications/components/ApplicationListRow.tsx
git commit -m "refactor(applications): row link region + actions cell"
```

---

## Task 10: Wire `ApplicationsList` — tailored map + shared drawers

**Files:**
- Modify: `src/features/applications/components/ApplicationsList.tsx`

**Interfaces:**
- Consumes: `getTailoredResumesFn` + `TailoredResumeSummary` (Task 4); `ResumeBuilderDrawer` (Task 7); `ResumePreviewDrawer` (existing); `ApplicationListRow` (Task 9); `adminKeys`.
- Produces: list renders inline actions; one shared preview drawer + one shared builder drawer.

- [ ] **Step 1: Add imports + the tailored query + selection state**

Add imports:

```typescript
import { useQuery } from '@tanstack/react-query'
import { getTailoredResumesFn, type TailoredResumeSummary } from '@/server/applications'
import { adminKeys } from '@/lib/api/query-keys'
import { ResumeBuilderDrawer } from './ResumeBuilderDrawer'
import { ResumePreviewDrawer } from '@/features/resumes/components/ResumePreviewDrawer'
```

Inside the component, after the existing `useApplications` query:

```typescript
  const { data: tailoredList } = useQuery({
    queryKey: adminKeys.applications.tailoredResumes,
    queryFn: () => getTailoredResumesFn(),
  })
  const tailoredBySlug = new Map((tailoredList ?? []).map((t) => [t.slug, t]))

  const [preview, setPreview] = useState<{ tr: TailoredResumeSummary; kind: 'resume' | 'cover' } | null>(null)
  const [editTarget, setEditTarget] = useState<{ tr: TailoredResumeSummary; view: 'resume' | 'cover' } | null>(null)
```

- [ ] **Step 2: Pass row props (replace the old `onClick` row usage)**

Replace the `paginatedApps.map(...)` block:

```tsx
              {paginatedApps.map((app) => (
                <ApplicationListRow
                  key={app.slug}
                  app={app}
                  tailored={tailoredBySlug.get(app.slug)}
                  onPreviewResume={(tr) => setPreview({ tr, kind: 'resume' })}
                  onPreviewCoverLetter={(tr) => setPreview({ tr, kind: 'cover' })}
                  onEdit={(tr, view) => setEditTarget({ tr, view })}
                />
              ))}
```

- [ ] **Step 3: Update the column-header grid template + add a trailing header**

Change the header row grid template to match the row (`sm:grid-cols-[1.5fr_1.5fr_12rem_8rem_auto]`) and add a final cell:

```tsx
              <span className="sr-only">Documents</span>
```

- [ ] **Step 4: Render the shared drawers (before the closing `</div>` of the outer container)**

```tsx
      {preview && (
        <ResumePreviewDrawer
          isOpen
          onClose={() => setPreview(null)}
          resume={preview.kind === 'resume' ? { label: `${preview.tr.targetCompany} — ${preview.tr.targetRole}`, data: preview.tr.data } as never : null}
          coverLetter={preview.kind === 'cover' ? preview.tr.coverLetter : null}
          coverLetterProfile={preview.tr.data.profile}
          coverLetterCompany={preview.tr.targetCompany}
          coverLetterRole={preview.tr.targetRole}
          onDownload={() => { /* download handled in detail menu; preview-only here */ }}
          isDownloading={false}
        />
      )}
      {editTarget && (
        <ResumeBuilderDrawer
          isOpen
          onClose={() => setEditTarget(null)}
          resume={editTarget.tr.data}
          coverLetter={editTarget.tr.coverLetter}
          company={editTarget.tr.targetCompany}
          role={editTarget.tr.targetRole}
          slug={editTarget.tr.slug}
          initialView={editTarget.view}
        />
      )}
```

Note: `ResumePreviewDrawer.resume` expects `AdminResumeWithData | null`; pass `{ label, data }` (its renderer only reads `label` + `data`). If typecheck rejects the cast, build a minimal object matching `AdminResumeWithData` — check its definition in `src/features/applications/hooks/use-resume-versions.ts`.

- [ ] **Step 5: Typecheck + tests**

Run: `yarn typecheck && yarn test`
Expected: PASS.

- [ ] **Step 6: Manual check**

Run: `yarn dev` → open `/applications/list`. Verify: rows show inline buttons only where a tailored resume exists; cover-letter buttons appear only when present; Preview opens the drawer; Edit opens the builder on the correct tab; Save persists (reload, re-open, edits remain); clicking the info region navigates to detail.

- [ ] **Step 7: Commit**

```bash
git add src/features/applications/components/ApplicationsList.tsx
git commit -m "feat(applications): inline resume/cover-letter actions in list"
```

---

## Task 11: Detail menu — reuse drawer + email-gated publish

**Files:**
- Modify: `src/features/applications/components/ApplicationActionsMenu.tsx`
- Modify: `src/app/_dashboard.applications.$slug.tsx`

**Interfaces:**
- Consumes: `ResumeBuilderDrawer` (Task 7); route context `me.email` from `_dashboard.tsx`.
- Produces: `ApplicationActionsMenu` takes `viewerEmail: string | undefined`; publish renders only when `viewerEmail === 'lamounier_88@hotmail.com'`; the in-component builder is replaced by `ResumeBuilderDrawer`.

- [ ] **Step 1: Add the email allow-list + prop**

In `ApplicationActionsMenu.tsx`, near the top:

```typescript
const PUBLISH_ALLOWED_EMAILS = new Set(['lamounier_88@hotmail.com'])
```

Add `readonly viewerEmail?: string` to `ApplicationActionsMenuProps` and destructure it.

- [ ] **Step 2: Gate publish**

Compute `const canPublish = viewerEmail !== undefined && PUBLISH_ALLOWED_EMAILS.has(viewerEmail)` and change the `onPublish` wiring:

```typescript
        onPublish={isApplied && hasTailoredResume && canPublish ? () => publishMutation.mutate() : undefined}
```

- [ ] **Step 3: Replace the in-component builder with `ResumeBuilderDrawer`**

Remove the local builder state (`isBuilderOpen`, `builderKey`, `prevStateRef`, `handleOpenBuilder`, `handleCloseBuilder`, the `enterEphemeralMode`/`setState`/`getState` imports, the cleanup effect, and the inline `DashboardDrawer` + `ResumeBuilderApp`). Replace with:

```typescript
  const [builderView, setBuilderView] = useState<'resume' | 'cover' | null>(null)
```

Wire the menu's edit action to open it (resume tab):

```typescript
        onEdit={isApplied && hasTailoredResume ? () => setBuilderView('resume') : undefined}
```

And render at the end of the returned fragment (only when there is a tailored resume):

```tsx
      {builderView && detail.analysis?.tailoredResume && (
        <ResumeBuilderDrawer
          isOpen
          onClose={() => setBuilderView(null)}
          resume={detail.analysis.tailoredResume as unknown as ResumeData}
          coverLetter={detail.analysis.coverLetter ?? null}
          company={detail.targetCompany}
          role={detail.targetRole}
          slug={detail.slug}
          initialView={builderView}
        />
      )}
```

Keep the existing download handlers (`handleDownloadResume`, `handleDownloadCoverLetter`) and the `publishMutation`/`deleteMutation` as-is.

- [ ] **Step 4: Pass `viewerEmail` from the detail route**

In `src/app/_dashboard.applications.$slug.tsx`, read the route context where `me` is available (`const { me } = Route.useRouteContext()` — match the existing context shape from `_dashboard.tsx`) and pass `viewerEmail={me?.email}` into `<ApplicationActionsMenu ... />`.

- [ ] **Step 5: Typecheck + test**

Run: `yarn typecheck && yarn test`
Expected: PASS. Update `src/__tests__/features/applications/ResumeMenuSelect.test.tsx` if it asserts on the old builder wiring.

- [ ] **Step 6: Add a publish-gating test**

Add to a menu test (or create `src/__tests__/features/applications/ApplicationActionsMenu.publish.test.tsx`): render with `viewerEmail` matching and not matching the allow-list, assert the **Publish** item is present only for the allowed email. (Open the menu; query by text `Publish`.)

- [ ] **Step 7: Manual check + commit**

Run: `yarn dev` → on an applied application, confirm Publish shows only when logged in as the allowed email; Edit opens the shared drawer and Save persists.

```bash
git add src/features/applications/components/ApplicationActionsMenu.tsx src/app/_dashboard.applications.$slug.tsx src/__tests__/features/applications/
git commit -m "feat(applications): email-gated publish + shared builder in detail menu"
```

---

## Task 12: Decommission Resumes hub + migrate routes to directory form

**Files:**
- Create: `src/app/_dashboard/resumes/route.tsx`, `src/app/_dashboard/resumes/edit.$id/route.tsx`, `src/app/_dashboard/resumes/new/route.tsx`
- Delete: `src/app/_dashboard.resumes.tsx`, `src/app/_dashboard.resumes.edit.$id.tsx`, `src/app/_dashboard.resumes.new.tsx`, `src/features/resumes/components/ResumesDisplayer.tsx`, `src/features/applications/components/CoverLetterForm.tsx`
- Modify: `src/components/layouts/AppLayout.tsx`, `src/features/overview/components/DashboardOverview.tsx`, `src/features/reports/components/ReportContainer.tsx`

**Interfaces:**
- Consumes: existing edit/new drawer content (move verbatim).
- Produces: `/resumes` is a bare outlet host; nav + quick links removed.

- [ ] **Step 1: Read the three flat route files**

Run: `sed -n '1,200p' src/app/_dashboard.resumes.edit.\$id.tsx src/app/_dashboard.resumes.new.tsx`
Capture their component bodies — the directory versions reuse the same logic (import the same `ResumeForm`/drawer, server fns, params).

- [ ] **Step 2: Create the directory parent route (bare outlet)**

`src/app/_dashboard/resumes/route.tsx`:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_dashboard/resumes')({
  component: () => <Outlet />,
})
```

- [ ] **Step 3: Create `edit.$id` and `new` directory routes**

`src/app/_dashboard/resumes/edit.$id/route.tsx` and `src/app/_dashboard/resumes/new/route.tsx`: port the bodies captured in Step 1 verbatim, updating only `createFileRoute('/_dashboard/resumes/edit/$id')` and `createFileRoute('/_dashboard/resumes/new')` path strings. Keep all imports/logic identical.

- [ ] **Step 4: Delete the flat route files + dead components**

```bash
git rm src/app/_dashboard.resumes.tsx src/app/_dashboard.resumes.edit.\$id.tsx src/app/_dashboard.resumes.new.tsx \
       src/features/resumes/components/ResumesDisplayer.tsx \
       src/features/applications/components/CoverLetterForm.tsx
```

- [ ] **Step 5: Remove the nav entry**

In `src/components/layouts/AppLayout.tsx`, delete the line:

```typescript
  { name: "Resumes",         href: "/resumes",       icon: DocumentTextIcon,      adminOnly: false },
```

Remove the now-unused `DocumentTextIcon` import only if nothing else uses it (grep first).

- [ ] **Step 6: Remove the "Manage Resumes" quick links**

In `src/features/overview/components/DashboardOverview.tsx` (line ~257) and `src/features/reports/components/ReportContainer.tsx` (line ~308), delete the `{ label: 'Manage Resumes', href: '/resumes', ... }` quick-link entries. Leave the resume-count stat cards (they call `getResumesFn`, still valid).

- [ ] **Step 7: Regenerate route tree + typecheck + lint + test**

Run: `yarn dev` briefly (or the router generate step) so `routeTree.gen.ts` regenerates, then stop it. Then:
Run: `yarn typecheck && yarn lint && yarn test`
Expected: PASS. Fix any straggler imports of `ResumesDisplayer`/`CoverLetterForm` (grep: `rg -n "ResumesDisplayer|CoverLetterForm" src`).

- [ ] **Step 8: Manual check**

Run: `yarn dev` → confirm the sidebar no longer shows Resumes; `/resumes/edit/<id>` (reached via an Edit action) still opens the drawer; `/resumes` renders nothing but does not error.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(resumes): retire hub page, migrate routes to directory form"
```

---

## Final verification

- [ ] **Full gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS, zero lint errors.

- [ ] **Golden path (`yarn dev`)**

From `/applications/list`: preview resume, preview cover letter, edit resume (Save → persists), edit cover letter (Save → persists across reload), publish visible only for `lamounier_88@hotmail.com`, info region navigates to detail, Resumes nav gone, `/resumes/edit/<id>` drawer still works.

---

## Self-review notes (coverage map)

- Spec §1 data flow → Task 4 (extend fn + key), Task 10 (map). 
- Spec §2 row a11y → Task 9.
- Spec §3 ApplicationRowActions → Task 8.
- Spec §4 builder Save + reverse adapters + ResumeBuilderDrawer → Tasks 5, 6, 7.
- Spec §5 email-gated publish → Task 11.
- Spec §6 cover-letter overrides store → Tasks 1, 2, 3, 4.
- Spec §7 decommission + route migration + delete dead files → Task 12.
- Testing requirements → Tasks 4, 5, 8, 11 (+ final gate).

Known limitation (documented in Task 5): the cover-letter signoff is preserved from the original rather than re-parsed from the builder's freetext closing.
