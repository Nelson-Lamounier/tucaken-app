# Career entries modal — view and edit extracted resume data

**Date:** 2026-07-08
**Status:** Approved (design), pending implementation
**Scope:** Frontend only. New feature slice `src/features/career-data/`, one new
thin server fn, two trigger touch-points. No admin-api changes.

## Problem

A user who uploads a resume PDF sees only counts: the uploaded-file row says
"3 entries extracted" and the dashboard Career Data panel shows
"Experience 3 / Education 2 / Skills 7". There is no way to see WHAT was
extracted, and no way to correct it. The onboarding review step even promises
"Edit individual entries any time from your profile" — a promise no UI
fulfils. The backend already supports everything needed:
`listCareerEntriesFn` and `updateCareerEntryFn` exist in
`src/server/resume-imports.ts`, and admin-api exposes
`GET/PUT/DELETE /resume-imports/career-entries/:eid`.

## Goal

A single reusable modal that shows the extracted career entries, lets the
user edit each entry through structured per-type forms, and delete entries
behind a confirmation — reachable from both the uploaded-file rows and the
dashboard Career Data panel.

## Component

`CareerEntriesModal` in `src/features/career-data/components/`:

```text
CareerEntriesModal({
  open: boolean
  onClose: () => void
  entryIds?: readonly string[]   // scope to one import; undefined = all entries
  title?: string                 // e.g. the import's original filename
})
```

- Data: the existing `listCareerEntriesFn` query (same query key the
  dashboard uses, `adminKeys.resumeImports.entries()`), filtered client-side
  by `entryIds` when provided. No new list endpoint.
- Modal shell: check TailwindPlus via the `tailwindplus` MCP first (per
  CLAUDE.md); otherwise Headless UI `Dialog` styled with app tokens.
  `rounded-md`, light + dark themes, full-screen sheet on small viewports,
  internal scroll (`overflow-y-auto`) — the page never scrolls horizontally.

### View mode

Entries grouped in fixed order — Experience, Education, Skills,
Certifications, Projects, Achievements — mirroring the onboarding review's
rendering, restyled for the app theme (the onboarding step is dark-only):

- Experience: `rawData.title`, `rawData.company`, `rawData.period`, full
  `rawData.highlights` list; `AI enriched` badge when
  `enrichmentStatus === 'complete'` and `enrichedData` present.
- Education: `rawData.degree`, `rawData.institution`, `rawData.period`.
- Skill: `rawData.skills` as chips.
- Other types: generic rendering of `rawData`'s string fields and
  string-array fields.
- Empty state: "No entries extracted yet" (+ enrichment-may-be-running hint
  when the latest import is still processing).

### Edit mode (structured forms)

Clicking Edit swaps that entry in place for a form. Forms are driven by a
small per-type field map so nothing is uneditable:

- Experience: text inputs for title, company, period; highlights as a list
  editor (add, remove, edit rows; empty rows dropped on save).
- Education: text inputs for degree, institution, period.
- Skill: chip editor (add via input + enter, remove per chip).
- Certification / project / achievement (and any future type): generic form —
  each top-level string field becomes a text input, each string-array field
  becomes a list editor. Non-string fields render read-only and are passed
  through unchanged on save.

Save merges the edited fields into the existing `rawData` (never replaces
fields the form does not manage), calls `updateCareerEntryFn({ data: { id,
rawData } })`, and invalidates `adminKeys.resumeImports.entries()` so the
modal, the Career Data panel counts, and any other consumer refresh
together. Forms use TanStack Form (repo convention); strings are trimmed and
empty list rows dropped on merge, and a form-level "at least one non-empty
managed field" guard blocks saving an emptied entry. Cancel restores view
mode unchanged.

### Delete

Per-entry Delete action behind a confirmation step, reusing the existing
`ConfirmModal` (`src/features/applications/stages/components/ConfirmModal.tsx`)
— it is already fully generic (title/body/confirmLabel/destructive/busy), so
per the reuse-first rule it is promoted verbatim to
`src/components/ui/ConfirmModal.tsx` with the applications imports updated in
the same change (mechanical move, no restyling). Confirmation copy states
that the entry's knowledge-base embeddings are removed with it. On confirm:
`deleteCareerEntryFn` → invalidate the entries query key.

## New server fn

`deleteCareerEntryFn` in `src/server/resume-imports.ts` (`createServerFn`,
method POST), calling the existing admin-api
`DELETE /resume-imports/career-entries/:eid` via the same authed fetch helper
the sibling fns use, validating `id` as a UUID with Zod. No other server or
admin-api change.

## Triggers (two, one component)

1. **Uploaded-file rows** on `/settings/github?tab=resumes` — the "Uploaded
   files" list rendered inline in `src/app/_dashboard.settings.github.tsx`
   (note: NOT the dashboard's `ResumeFilesList`, which is a separate
   component and stays unchanged): each import row gains a "View data"
   action, opening the modal with `entryIds = imp.careerEntriesCreated` and
   `title = imp.originalFilename`. Rows whose import has no created entries
   (failed/processing) disable the action. This is a trivial touch to the
   flat route (one button + one modal mount, logic stays in the feature), so
   it does not trigger the settings-group directory migration.
2. **Career Data panel** (`src/features/user-home/components/CareerDataBreakdown.tsx`):
   gains a "View data" button opening the modal unscoped (all entries). The
   existing "View imports →" navigation link stays as-is.

Each trigger owns its modal `open` state locally (useState). No store.

## Honest caveat (shown in the modal footer)

Editing an entry updates the career data used for resumes and coaching, but
does NOT regenerate the knowledge-base embeddings created at import time
(verified: the PUT handler updates `rawData` only). Deleting an entry also
deletes its embeddings (DELETE cascades `experience_embeddings`). The footer
states this in one sentence so users are not misled about retrieval effects.

## Out of scope

- Re-embedding / KB re-sync on edit.
- Creating brand-new entries by hand.
- Re-parsing the PDF or changing extraction.
- Any admin-api change.
- Editing `enrichedData` (edits target `rawData` only).

## Responsiveness and accessibility

- Modal is a centred dialog from `sm` upwards and a full-screen sheet below;
  content scrolls internally; chips and highlight rows wrap; no horizontal
  overflow at ~320px.
- Dialog semantics via Headless UI (focus trap, Escape to close, backdrop
  click), labelled by the modal title; per-entry actions are real buttons
  with accessible names (`Edit <entry title>`, `Delete <entry title>`).
- Both themes verified; reduced-motion respected (no entrance animation or a
  simple fade via existing conventions).

## Testing

- Vitest render tests for `CareerEntriesModal`:
  - groups and renders entries by type; scopes to `entryIds` when provided;
  - edit flow: save calls `updateCareerEntryFn` with merged `rawData`
    (unmanaged fields preserved) and exits edit mode;
  - delete flow: confirm step, then `deleteCareerEntryFn` called; cancel does
    not call it;
  - empty state renders.
- Trigger tests: file row opens modal scoped; Career Data panel opens modal
  unscoped (light assertions).
- `yarn typecheck && yarn lint && yarn test` green; manual pass on the live
  page (real uploaded resume) in both themes and at narrow width.
