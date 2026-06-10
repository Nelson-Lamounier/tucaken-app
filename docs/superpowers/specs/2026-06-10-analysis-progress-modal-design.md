# Toggleable Analysis Progress Modal

**Date:** 2026-06-10
**Status:** Approved (design)
**Area:** `src/features/applications/components`

## Problem

After submitting a resume analysis on the Resume Builder page
(`/applications/new`), `NewAnalysisPanel` replaces the entire form with the
inline `ProgressBars` component and, on completion, auto-redirects to
`/applications/$slug`. The user cannot keep using the page while the ~4–6 minute
pipeline runs, and the forced redirect pulls them away from the builder.

## Goal

Show progress in a **centered, dismissible modal** instead of inline. The
pipeline runs in the background; the user can dismiss the modal and re-open it
from a "View progress" pill. On completion the modal shows a "View results" CTA
— no forced navigation.

## Decisions

Captured during brainstorming:

1. **Auto-open, dismissible, re-openable.** Submitting auto-opens the modal over
   the (still-present) form. Closing hides it; the pipeline keeps running. A
   persistent "View progress" pill re-opens it.
2. **On completion: stay.** The modal flips to an "Analysis complete" state with
   a "View results →" button. No auto-redirect.
3. **Centered Headless UI `Dialog` + inline pill.** A transient centered modal
   (not the side `DashboardDrawer`); the re-open pill lives on the Resume Builder
   page.

## Behavior

- The Resume Builder **form stays mounted at all times**. After a successful
  submit it resets (as it already does), ready for another run.
- On submit success — and on the test-mode mock path — record `submittedSlug`,
  `submittedRunId`, and `submittedAt` (a millisecond timestamp), and set
  `isProgressOpen = true` so the modal auto-opens.
- The modal is a Headless UI `Dialog`, centered with a dim backdrop. Escape and
  outside-click call `onClose`, which only **hides** the modal
  (`isProgressOpen = false`) — it does NOT clear `submittedSlug`, so the pill
  remains.
- While `submittedSlug` is set, a **"View progress" pill** renders on the page
  (small spinner + label). Clicking it re-opens the modal. A `×` on the pill
  clears `submittedSlug` / `submittedRunId` / `submittedAt` and closes the modal,
  removing both pill and modal.
- On completion the modal's `ProgressBars` shows its existing "Analysis complete"
  heading and a **"View results →"** link to `/applications/$slug`. No redirect.

## Components

| File | Change |
|---|---|
| `src/features/applications/components/AnalysisProgressModal.tsx` *(new)* | Centered Headless UI `Dialog` wrapping `ProgressBars`. Props: `isOpen: boolean`, `onClose: () => void`, `slug: string`, `pipelineRunId?: string`, `startedAt: number`. Dim backdrop, centered panel, light+dark surface. |
| `src/features/applications/components/ProgressBars.tsx` *(modify)* | (a) Remove the auto-redirect `useEffect` (the one that navigates to `/applications/$slug` ~800 ms after `isFinished`). (b) Add a required `startedAt: number` prop; compute elapsed as `now - startedAt` instead of seeding `startEpochRef` with `Date.now()` on mount, so the timer is correct across modal open/close remounts. (c) Relabel the complete-state footer link from "Go to overview →" to "View results →". The `useNavigate` import becomes unused once the redirect is gone — remove it. |
| `src/features/applications/components/NewAnalysisPanel.tsx` *(modify)* | Remove the `if (submittedSlug) { return <ProgressBars/> }` early return so the form always renders. Add `isProgressOpen` (boolean) and `submittedAt` (number \| null) state. On submit success / test-mode, set `submittedSlug`, `submittedRunId`, `submittedAt`, and `isProgressOpen = true`. Render: the "View progress" pill (when `submittedSlug` set) and `<AnalysisProgressModal isOpen={isProgressOpen} onClose={…} slug={submittedSlug} pipelineRunId={submittedRunId ?? undefined} startedAt={submittedAt} />`. Add a `clearSubmission()` helper (the pill's `×`) that nulls the three submission fields and closes the modal. |

### State ownership

`NewAnalysisPanel` owns the submission + modal-open state. `ProgressBars` stays
the single source of progress UI and polling (`useApplicationDetail`,
`usePipelineRunStatus`) — the modal is a presentational shell. React Query keeps
the slug-keyed status cache warm across modal open/close; `startedAt` keeps
elapsed honest if `ProgressBars` unmounts on close and remounts on re-open.

## Edge cases

- **Close while running:** modal hides, pill remains, pipeline continues. Re-open
  resumes polling from the warm React Query cache; elapsed is correct via
  `startedAt`.
- **Completes while modal closed:** the existing header notification watcher
  still tracks/notifies cross-page; re-opening the modal polls and shows the
  complete state. (No change to the watcher.)
- **Failure / timeout:** unchanged — `ProgressBars` already renders the failed /
  timed-out states and the "Retry via DLQ" button; these now appear in the modal.
- **New submit while a pill exists:** the new submit overwrites `submittedSlug` /
  `submittedRunId` / `submittedAt` and re-opens the modal for the new run.

## Testing

- Component test (Vitest, `@vitest-environment happy-dom`), with `ProgressBars`
  mocked to a stub: submit via the test-mode path → modal is open; call
  `onClose` → modal hidden, "View progress" pill visible; click pill → modal
  re-opens; click pill `×` → pill and modal both gone.
- `NewAnalysisPanel.payload.test.tsx` is unaffected: its `useApplicationsTrigger`
  mock never invokes `onSuccess`, so `submittedSlug` stays null and no modal
  renders. Re-run it to confirm.
- Manual: `yarn dev`, submit a test-mode analysis on `/applications/new`; verify
  auto-open, dismiss, pill re-open, pill `×`, complete-state "View results", and
  dark/light rendering of the modal.

## Out of scope

- Header notification bell / `PipelineNotificationWatcher` changes.
- The auto-redirect removal applies only to `ProgressBars`, which has a single
  caller (`NewAnalysisPanel`) — confirmed, so no other flow regresses.

## Verification

`yarn typecheck && yarn lint && yarn test` green before done; manual UI pass per
Testing above.
