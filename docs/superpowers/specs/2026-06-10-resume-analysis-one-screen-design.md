# Resume Analysis — One-Screen Creation Flow

**Date:** 2026-06-10
**Status:** Approved (design)
**Area:** `src/features/applications`, `src/app/_dashboard/applications/new.tsx`

## Problem

Creating a job-description resume analysis takes three clicks across a two-step
wizard:

1. Navigate to `/applications/new` (from a dashboard card).
2. Pick a resume on a full-screen Step 1 gate.
3. Fill company / role / job description on Step 2 and click **Start Analysis**.

The resume-selection step is a forced full-screen gate placed *before* the
actual work (pasting the job description), even though a sensible default
exists: the user's **active** resume (already sorted first in
`ResumeSelect`). The form already hides its own resume field with a comment
noting it "moved to a previous pipeline step" — evidence the split is
incidental, not essential.

## Goal

Collapse the two-step wizard into a single screen. From landing, the user
pastes a job description and clicks **Start Analysis**. The resume defaults to
the active version and is switchable inline. This removes one full screen and
the click required to leave it.

Non-goal: reducing the required company/role typing via backend derivation
(see Out of Scope).

## Decisions

Captured during brainstorming:

1. **One screen, resume defaults.** Both wizard steps merge into a single page.
   The active resume is auto-selected; the job-description paste is the hero
   input.
2. **Company + role stay as two required fields**, inline above the JD. The
   server schema (`analyseTriggerSchema`) requires `targetCompany` and
   `targetRole` as non-empty strings; keeping them client-side means zero
   backend work and the fastest ship.
3. **Resume switching via a compact dropdown/popover.** A chip shows the active
   resume; clicking opens a Headless UI `Listbox` listing all versions plus a
   "Build from scratch with agent" action.

## Behavior

- Route `/applications/new` renders a **single** panel. No `step` state, no
  `FullWidthBar` wizard indicator.
- A **resume selector** sits at the top of the panel as a compact chip showing
  the currently selected resume. Clicking opens a dropdown listing every
  version with: label, an **Active** badge where applicable, and the
  "last updated" date. The dropdown also offers two actions:
  - **✨ Build from scratch with agent** → selects `resumeId = ''`.
  - **Create new resume** → link to `/resumes/new`.
- **Default selection** on load: active resume → else most-recently-updated →
  else "build from scratch" when the user has no resumes.
- The rest of the form is unchanged and rendered inline below the selector:
  Target Company + Target Role (required), Interview Stage (select, defaults
  `applied`), Generate Cover Letter (checkbox, default on), Run in Test Mode
  (checkbox), Job Description (textarea, min 50 chars), and the **Start
  Analysis** primary action.
- `localStorage` draft-saving (`application-form-draft`) and the `ProgressBars`
  post-submit takeover (which owns navigation to `/applications/$slug`) are
  preserved exactly as they are today.

## Components

| File | Change |
|---|---|
| `src/app/_dashboard/applications/new.tsx` | Remove the `step` state, the `FullWidthBar` indicator, and the conditional `ResumeSelect`/`NewAnalysisPanel` rendering. Hold `resumeId` state here (default resolved once resume versions load) and render `NewAnalysisPanel` with `resumeId` + `onResumeChange`. |
| `src/features/applications/components/NewAnalysisPanel.tsx` | Change `preselectedResumeId: string` prop to a controlled `resumeId: string` + `onResumeChange: (id: string) => void`. Render the new `ResumeMenuSelect` in the panel header (replacing the static "Resume selected" badge). Remove the dead hidden block at lines ~217–219. Keep all existing form fields, draft-save, error UI, and `ProgressBars` takeover. |
| `src/features/applications/components/ResumeMenuSelect.tsx` *(new)* | A focused resume picker built on Headless UI `Listbox`, styled to match `src/components/ui/CustomDropDown.tsx`. Consumes the existing `useResumeVersions` hook. Renders: loading skeleton, version list (label + Active badge + updated date), "Build from scratch with agent" action, and "Create new resume" link. Resolves and reports the default selection to the parent on first load. |
| `src/features/applications/components/ResumeSelect.tsx` | **Delete.** The full-screen step is obsolete. Its empty-state affordances ("Create new Resume", "Build from scratch with the agent") migrate into `ResumeMenuSelect`. Remove the file and its import; run `yarn typecheck` to catch stragglers. |

### Default-selection ownership

`new.tsx` owns `resumeId` state. The default cannot be resolved until resume
versions load, so the resolution lives where the data is fetched. Two viable
shapes — pick during implementation, preferring the simpler:

- **A:** `new.tsx` calls `useResumeVersions`, resolves the default, seeds state.
  `ResumeMenuSelect` becomes a controlled presentational dropdown.
- **B:** `ResumeMenuSelect` owns the fetch and reports its resolved default up
  via an effect/callback; `new.tsx` only stores the chosen id.

Option A keeps a single fetch site and a dumb dropdown — preferred unless it
duplicates the hook call awkwardly.

## Edge Cases

- **Resumes loading:** the chip shows a small skeleton; the form stays usable.
  Submitting before load completes is gated the same way as today (Start is
  disabled until company/role/JD are valid; `resumeId` may be empty, which is a
  valid "from scratch" value).
- **No resumes:** selector defaults to "Build from scratch"; the dropdown
  surfaces the **Create new resume** link, preserving today's empty-state
  affordances.
- **Build from scratch selected:** `resumeId = ''` (unchanged server contract).
  The panel header badge already swaps to "Building from scratch" based on the
  empty id — keep that logic.

## Testing

- Unit/component (Vitest, colocated): `ResumeMenuSelect` renders versions,
  marks the active one, defaults correctly across the three data states
  (active present / no active but versions exist / no versions), and emits the
  right `resumeId` (including `''`) on selection.
- Regression: `NewAnalysisPanel` still submits the correct payload via
  `useApplicationsTrigger` with the selected `resumeId`, preserves draft-save,
  and hands off to `ProgressBars` on success.
- Manual: `yarn dev`, exercise golden path (paste JD against active resume →
  Start) plus switching resume and "build from scratch"; verify dark mode.

## Out of Scope

- Backend derivation of company/role from the JD (would make those fields
  optional server-side — separate cross-repo change in admin-api + pipeline).
- Routing-tree directory migration: this edits one existing route file in place
  with no new siblings, no rename, and no logic split, so the incremental
  migration rule is not triggered.
- The `/applications` hub card and the home `KbQuickActions` card continue to
  link to `/applications/new` (now the single screen) — no entry-point changes.

## Verification

`yarn typecheck && yarn lint && yarn test` green before done; manual UI pass per
Testing above.
