# Onboarding: defer Review to a terminal step

**Date:** 2026-05-17
**Status:** Approved (design)

## Problem

In the first-run onboarding wizard, Step 3 (`resume` / `ImportCareerStep`)
currently runs the entire post-extraction experience inline:
`upload → processing → Review list + GapAnalysisReport → "Looks good" →
Enhance (EnhanceRoleCard) → saved → onNext`. The "Review extracted career
history" screen therefore appears as the immediate next page after
extraction, mid-wizard.

Desired flow: Step 3 finishes extraction (the document progress ring fills
the full circle), transitions smoothly to Step 4, and the
Review/gap/enhance experience renders **once, at the very end**, after the
final Step 5 (`processing` / `ProcessingStep`).

## Decisions (from brainstorming)

1. **Extraction blocks Step 3.** Step 3 waits for full extraction (ring to
   100%) before advancing. Steps 4–5 happen after extraction is complete;
   review data is ready, only its rendering is deferred.
2. **Scope moved:** the entire post-extraction experience — Review list,
   `GapAnalysisReport`, and the Enhance/`EnhanceRoleCard` editing phase.
3. **Destination:** a new terminal step `review` added **after**
   `processing`. `ProcessingStep` stops redirecting to `/overview`; the new
   `ReviewStep` owns the final `/overview` navigation via a Finish action.

## Architecture

New step order:
`welcome → portfolio → resume → connect → repos → processing → review`

- `resume` (Step 3, `ImportCareerStep`): upload + processing only. On
  extraction terminal → ring springs to 100%, a ~900ms completion beat
  (check mark), then `onNext()` → Step 4. Error/retry UI stays here.
- `processing` (`ProcessingStep`): no longer redirects to `/overview`.
  Gains an `onNext` prop; when all connected repos are terminal it calls
  `onNext()` → `review`.
- `review` (new `ReviewStep`): renders the moved Review list +
  `GapAnalysisReport` + Enhance phase + saved confirmation. **Finish**
  button → `navigate({ to: '/overview', replace: true })`.

### State lifting (key change)

`importId` is currently local React state in `ImportCareerStep` and is lost
when the component unmounts on step change. It must be lifted to
onboarding-level state so the terminal `ReviewStep` can drive its queries:

- `OnboardingData.resumeImportId?: string`
- `useOnboardingState.setResumeImportId(id)`
- `ImportCareerStep` calls it (via an `onExtracted` prop) on extraction
  terminal, before advancing.
- `ReviewStep` reads `s.data.resumeImportId` to query
  `getImportProgressFn` (for `gapReportReady`), `listCareerEntriesFn`,
  `getGapReportFn`, the enhance entries query, and `updateCareerEntryFn`.

### Skip path

The resume step is skippable (`onSkip = s.next`), producing no
`resumeImportId`. `ReviewStep` with no id renders a minimal "You're all
set" + Finish and fires **no** queries. This must be handled or the final
step breaks for users who skip the resume.

## Components & data flow

**`types.ts`**
- `StepId` += `'review'`.
- `STEPS` += `{ id: 'review', name: 'Review', required: true }`.
- `OnboardingData` += `resumeImportId?: string`.

**`useOnboardingState.ts`**
- `STEP_INDEX.review = 6`.
- Add `setResumeImportId(id: string)` setter; expose in return value.

**`ImportCareerStep.tsx`** (shrinks)
- Phases: `idle | requesting-url | uploading | processing | complete | error`.
- Remove `review`/`enhance`/`saved` render blocks; remove `entries`,
  `gapReport`, `enhancedEntries` queries and `handleSaveEntry`; remove
  `GapAnalysisReport` / `EnhanceRoleCard` imports.
- On `progress.terminal && !progress.error`: call `onExtracted(importId)`,
  set phase `complete`.
- `complete` render: progress ring forced to 100% (spring), static
  "Career history extracted" + check icon; after ~900ms call `onNext()`.
- Props add `onExtracted(id: string)`.

**`ReviewStep.tsx`** (new)
- Props: `importId?: string`.
- No id → "You're all set" + Finish; no queries.
- With id → lifted queries; local sub-state `'review' | 'enhance' |
  'saved'`; renders Review list, `GapAnalysisReport`, Enhance
  (`EnhanceRoleCard` + `updateCareerEntryFn`), saved confirmation. Finish →
  `useNavigate()({ to: '/overview', replace: true })`.

**`ProcessingStep.tsx`**
- Add `onNext` prop; replace `navigate({ to: '/overview' })` with
  `onNext()`.

**`OnboardingShell.tsx`**
- Import `ReviewStep`. Wire `ImportCareerStep onExtracted={s.setResumeImportId}`,
  `ProcessingStep onNext={s.next}`, and
  `{s.stepId === 'review' && <ReviewStep importId={s.data.resumeImportId} />}`.
- Treat `review` like `processing` for chrome: no progress bar; header
  badge "Review".

## Transition

`OnboardingShell` already wraps steps in `AnimatePresence mode="wait"`
keyed by `stepId` (opacity + x-slide, 0.32s, ease `[0.22,1,0.36,1]`),
giving smooth step→step motion for free. The added polish is the
`complete` phase in `ImportCareerStep`: hold the ring at 100% with a check
for ~900ms so completion is visibly registered before the slide to Step 4.

## Error handling

- Extraction errors (`progress.error`) keep the existing Step 3
  `error` phase with Retry / Skip. `ReviewStep` is only reached on success
  or skip, so it assumes a healthy or absent import.
- `ReviewStep` queries are non-fatal: a null gap report renders nothing
  (existing `GapAnalysisReport` behaviour); empty entries render the
  existing empty state.

## Testing

- `useOnboardingState.test.ts`: extend for `review` index,
  `setResumeImportId` mutation, and `next()` reaching `review` as the
  terminal step.
- New `ReviewStep` test: no-id → Finish only, zero queries; with-id →
  entries + gap render, enhance → saved → navigate to `/overview`.
- `ImportCareerStep` test: terminal progress → `onExtracted` called and
  advances via `onNext`, with no inline review rendered.
- `_dev-mock.ts` unchanged — it already serves progress/entries/gap keyed
  by import id; the 2-min `PROCESSING_MS` dev knob stays for UI work and
  must be reverted before shipping.

## Out of scope

- No change to extraction backend, admin-api, or query keys.
- No change to the visual design of the document ring / FillText beyond
  the new `complete` (100%) state.
- No unrelated refactors of other onboarding steps.
