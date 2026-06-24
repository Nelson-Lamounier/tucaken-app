# Design — Resume & cover-letter access under Job Applications; retire Resumes hub

Date: 2026-06-24
Branch: `worktree-feat+applications-resume-links` (from `origin/main`)
Status: Draft for review

## Goal

Let users reach the generated **resume** and **cover letter** for each job
application directly from the **Job Applications / List of all applications**
surface — Preview and Edit for both — and **decommission** the standalone
**Resumes** hub page (`/resumes`), so applications become the single access
point. Preserve the "publish active resume to the public site" capability, but
restrict it to a single operator.

## Locked decisions

| Decision | Choice |
|---|---|
| Link placement | Inline icon buttons in each list row |
| Resume "Edit" target | Promote tailored resume to a saved resume, then edit |
| Publish flow | Keep it; move into Applications; **email-gated** to `lamounier_88@hotmail.com` |
| Cover-letter edit | Full edit via a new server fn (overrides store) + `CoverLetterForm` drawer |
| Resumes route group | Migrate `_dashboard.resumes.*` flat files → directory routes |

## Current state (verified in code)

- List row: `src/features/applications/components/ApplicationListRow.tsx` — a single
  `<button>` wrapping the whole row; data is `ApplicationSummary` only (no resume /
  cover-letter data or presence flags).
- List container: `src/features/applications/components/ApplicationsList.tsx`.
- Detail actions: `src/features/applications/components/ApplicationActionsMenu.tsx`
  already implements download / edit (ephemeral builder) / **publish**
  (`createResumeFn` + `setActiveResumeFn`) / delete — gated on `?stage=applied`.
- `getTailoredResumesFn()` (`src/server/applications.ts`) already fetches full
  detail per application server-side and returns `{slug, targetCompany, targetRole,
  updatedAt, data: ResumeData}` for every app with `analysis.tailoredResume`.
- Resume CRUD: `src/server/resumes.ts` — `getResumesFn`, `getResumeFn`,
  `createResumeFn`, `updateResumeFn`, `setActiveResumeFn`, etc.
- Preview: `src/features/resumes/components/ResumePreviewDrawer.tsx` (handles both
  resume and cover letter).
- Cover-letter form: `src/features/applications/components/CoverLetterForm.tsx`
  (exists, not wired to a route).
- Resumes hub: `src/app/_dashboard.resumes.tsx` renders `ResumesDisplayer` +
  `<Outlet/>`; children `_dashboard.resumes.edit.$id.tsx`, `_dashboard.resumes.new.tsx`.
- Current user: `_dashboard.tsx` `beforeLoad` calls `getMeFn()` and puts
  `{ me, isAdmin }` in route context; `me.email` is available to dashboard
  components via `Route.useRouteContext()`.
- **Cover letter is read-only pipeline provenance**: admin-api builds `analysis`
  (incl. `coverLetter`) from `pipeline_runs.metadata.analysis` at read time
  (`admin-api/src/routes/applications.ts`). There is **no** cover-letter write
  endpoint. Annotations use a separate override store
  (`updateApplicationAnnotations`) merged at read time — the model to follow.

## Architecture

### 1. Data flow — one server call carries everything

Rows must know resume/cover-letter presence and hold the data for preview/edit
without a per-click fetch.

- Extend `TailoredResumeSummary` (`src/server/applications.ts`) with
  `coverLetter: CoverLetter | null`. `getTailoredResumesFn()` already loads full
  detail per app server-side, so add `coverLetter: detail.analysis.coverLetter ?? null`
  to each pushed entry. No extra network cost.
- `ApplicationsList` fetches `getTailoredResumesFn()` once (TanStack Query),
  builds `Map<slug, TailoredResumeSummary>`, passes the matching entry to each row
  as `tailored?: TailoredResumeSummary`.
- Presence: `tailored` ⇒ resume buttons render; `tailored.coverLetter` ⇒
  cover-letter buttons render.

### 2. Row restructure (accessibility)

A row is currently one `<button>`; nesting action buttons inside is invalid.
Rework `ApplicationListRow`:

- Outer `<div>` grid with a new actions column:
  `grid-cols-[1.5fr_1.5fr_12rem_8rem_auto]` (sm+). Mobile stays single column.
- Wrap the info cells (company / role / stage / status) in a single
  `<Link to="/applications/$slug" params={{ slug }}>`.
- Actions cell holds `ApplicationRowActions` (separate, real buttons).
- Update the column-header row in `ApplicationsList` to match the new template
  (add a trailing blank/"Documents" header).

### 3. New component — `ApplicationRowActions`

`src/features/applications/components/ApplicationRowActions.tsx`. Compact
`rounded-md` icon buttons (lucide), each with an accessible label:

- **Preview Resume** (`Eye`) → opens `ResumePreviewDrawer` with `tailored.data`.
- **Edit Resume** (`Pencil`) → promote-to-saved, then navigate to edit route.
- **Preview Cover Letter** (`FileText`) → `ResumePreviewDrawer` with
  `tailored.coverLetter` — only when present.
- **Edit Cover Letter** (`PenLine`) → opens `CoverLetterForm` drawer — only when
  present.

Buttons emit callbacks; the controlling drawer/selection state lives in
`ApplicationsList` (one drawer instance shared across rows), driven by a
`selected: { slug; kind: 'preview-resume' | 'preview-cl' | 'edit-cl' } | null`.

### 4. Promote-to-saved, then edit (idempotent)

`onEditResume(tr)`:

1. `getResumesFn()` → find by label `${tr.targetCompany} — ${tr.targetRole}`.
2. If found, reuse its `resumeId`; else `createResumeFn({ label, data: tr.data })`.
3. Navigate to the resume edit route with that `resumeId`.

Deterministic label ⇒ re-editing the same application reuses the same saved
record (no duplicates). Matches the label already used by the detail-view publish
mutation.

### 5. Publish — email-gated

Keep publish in the detail-view dropdown (`ApplicationActionsMenu` →
`DropDownOptions`). Add an email gate: pass `onPublish` only when
`me.email === 'lamounier_88@hotmail.com'` (from `Route.useRouteContext()` in the
detail route, threaded into `ApplicationActionsMenu`). Every other user never
sees the option. (This is presentation gating; admin-api authorisation remains
the real control.)

### 6. Cover-letter edit — overrides store (new server fn)

Cover letter is immutable pipeline output; do **not** mutate
`pipeline_runs.metadata`. Follow the annotations override pattern:

- **admin-api**: add `PUT /applications/:slug/cover-letter` that upserts an
  override row (new column/table mirroring annotations), and merge it over
  `rawAnalysis.coverLetter` in the detail read (`applications.ts`).
- **client**: `updateApplicationCoverLetterFn` in `src/server/applications.ts`
  (`createServerFn` POST → admin-api PUT, Zod-validated body matching
  `CoverLetter`).
- Wire `CoverLetterForm` into a `DashboardDrawer` opened from
  `ApplicationRowActions`; on submit call the fn, invalidate
  `adminKeys.applications.*` and the tailored-resumes query.

### 7. Decommission Resumes hub + route migration

Migrate `_dashboard.resumes.*` flat files to directory form (CLAUDE.md mandate
when touching a route group non-trivially):

```
src/app/_dashboard/resumes/
  route.tsx        # bare <Outlet/> host (NO ResumesDisplayer, NO DashboardPage chrome)
  edit.$id/route.tsx
  new/route.tsx
```

- `/resumes` is no longer a navigable page — its only job is hosting the edit/new
  drawers reached from Applications.
- Remove the nav entry (`AppLayout.tsx:52`) and the "Manage Resumes" quick-links
  in `DashboardOverview` and `ReportContainer`.
- `ResumesDisplayer` becomes unused → delete it (and any now-dead imports).
- Run `yarn typecheck` to catch import stragglers; `routeTree.gen.ts` regenerates.

## Components / interfaces summary

| Unit | Responsibility | Depends on |
|---|---|---|
| `getTailoredResumesFn` (extended) | server: resume + cover letter per app | admin-api detail |
| `updateApplicationCoverLetterFn` (new) | server: persist CL override | admin-api PUT |
| `ApplicationsList` (edited) | fetch tailored map, own shared drawers | the two server fns |
| `ApplicationListRow` (refactored) | layout, link region + actions cell | `ApplicationRowActions` |
| `ApplicationRowActions` (new) | per-row Preview/Edit buttons + callbacks | drawers, navigate |
| `ApplicationActionsMenu` (edited) | email-gated publish | route context `me.email` |
| Resumes route dir (migrated) | host edit/new drawers only | — |

## Error handling

- Missing resume/cover letter ⇒ button not rendered (presence-gated), never a
  dead click.
- Promote-to-saved failures (`getResumesFn`/`createResumeFn`) ⇒ toast via
  `useToastStore`, no navigation.
- Cover-letter save failure ⇒ toast; drawer stays open with the user's edits.
- Email gate is presentational; admin-api stays the authorisation boundary.

## Testing

- `getTailoredResumesFn` returns `coverLetter` alongside resume data.
- Promote-to-saved is idempotent (existing label reused, no duplicate create).
- Publish option renders only for the gated email (extend
  `ResumeMenuSelect.test.tsx` / add a menu test).
- `ApplicationRowActions` renders only the buttons matching available content.
- Cover-letter override round-trips (server fn unit + read-merge).
- `yarn typecheck && yarn lint && yarn test` green; manual `yarn dev` golden path.

## Scope / risks

- **Heaviest piece**: cover-letter override (admin-api route + storage + read
  merge). If schema work is undesirable this PR, fall back to preview-only cover
  letter and defer edit — flagged for the reviewer.
- Route migration touches generated `routeTree.gen.ts` (regenerated, not hand-edited)
  and all `/resumes` import sites.
- Deleting `ResumesDisplayer` also drops the standalone resume-version
  delete/list UI; saved-resume management now happens only via edit drawers.

## Out of scope (YAGNI)

- Per-row Download buttons (download stays in the detail dropdown).
- Bulk resume management UI.
- Re-theming the resume builder.
