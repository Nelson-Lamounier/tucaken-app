# Gap Analysis — Guided Role Enhancement in Onboarding

**Date:** 2026-05-09  
**Status:** Approved  
**Scope:** `tucaken-app` frontend + `admin-api` server function

---

## Problem

After a resume is imported, Tavily searches the web for each experience role and Bedrock synthesises typical responsibilities, transferable skills, and industry context into `enriched_data` on each `user_career_history` row. This data is stored in the database but never surfaced to the user.

Users who have experience but can't articulate it — e.g. "worked as QA Analyst at Accenture on a Meta project" with two sparse bullet points — get no help structuring their profile. The enrichment data that could fill these gaps is invisible.

---

## Goal

Surface `enriched_data` in the onboarding flow as a guided editing experience: show each role's web-researched responsibilities as pre-filled editable fields. Users tweak the text and save. Sparse entries become properly structured before the user leaves onboarding.

---

## Decision Log

| Question | Decision |
|---|---|
| Where does gap analysis surface? | Onboarding — new `enhance` phase within `ImportCareerStep` |
| What action can users take? | Guided edit — suggestions pre-fill editable highlight fields |
| How to handle unenriched entries? | Progressive — poll per-entry, show spinner until `enrichment_status` resolves |
| Reuse existing form? | Yes — `ImportCareerStep` extended; OnboardingShell swaps `ResumeStep` for it |

---

## Architecture

### State Machine Extension

`ImportCareerStep` gains one new phase:

```
idle → requesting-url → uploading → processing → review → enhance → saved
```

The `enhance` phase is entered when the user clicks "Looks good" in `review`. It polls `listCareerEntriesFn()` every 3 s for `enrichment_status` changes on experience entries. Polling stops when every experience entry has reached a terminal enrichment status (`complete`, `skipped`, or `failed`).

### Data Flow

```
enriched_data.responsibilities[]   → pre-fill editable highlight textareas
enriched_data.transferableSkills[] → read-only context chips (not saved)
enriched_data.careerLevel          → read-only badge (not saved)
enriched_data.industryContext      → single line of context below title

User edits highlights
  → PUT /resume-imports/career-entries/:id
  → body: { rawData: { ...existing, highlights: string[] } }
  → updates user_career_history.raw_data in RDS
```

No new backend endpoints are needed. `updateCareerEntryFn` (a new TanStack server function wrapping the existing `PUT /career-entries/:id` admin-api route) is the only addition.

### Surfaces Covered

| Surface | Before | After |
|---|---|---|
| `/settings/github` Step 1 | `ImportCareerStep` (review only) | `ImportCareerStep` (review + enhance) |
| Onboarding wizard `/onboarding` | `ResumeStep` (counts only) | `ImportCareerStep` (full flow) |

---

## Components

### `ImportCareerStep.tsx` — extended

New phase added to existing state machine. ~120 lines of new render code.

**enhance phase layout:**

```
Header:
  "Enhance your experience"
  "We researched each role online. Review the suggestions,
   edit your highlights, and save — or skip to keep them as extracted."

Body (scrollable, one EnhanceRoleCard per experience entry):
  [EnhanceRoleCard for role 1]
  [EnhanceRoleCard for role 2 — spinner if not enriched yet]
  ...

Footer:
  [← Back to review]   [Skip enhancement]   [Save & continue →]

  "Save & continue" is always enabled (user can skip through without saving).
```

---

### `EnhanceRoleCard.tsx` — new component

**Props:**
```ts
interface EnhanceRoleCardProps {
  entry:  CareerEntry
  onSave: (id: string, highlights: string[]) => Promise<void>
}
```

**Internal state:**
```ts
fields:  string[]   // editable lines, pre-filled from suggestions
saving:  boolean
saved:   boolean
```

**Pre-fill logic:**
When `entry.enrichmentStatus === 'complete'` and `enrichedData` arrives:
- Start with `rawData.highlights` (what user wrote)
- Append any `enrichedData.responsibilities` not already present (deduped by substring match)
- Result becomes initial `fields` state

**Enrichment status variants:**

| `enrichment_status` | Rendered as |
|---|---|
| `pending` / `enriching` | Skeleton card + spinner + "Researching this role…" |
| `complete` | Full editable card with suggestions |
| `skipped` / `failed` | Plain editable card with existing highlights, note: "No web research available for this role" |

**Card layout (complete state):**
```
┌──────────────────────────────────────────────────────┐
│  Title · Company · Period          [senior] badge     │
│  industryContext (zinc-500, 1 line)                   │
│                                                       │
│  Your highlights                                      │
│  [● textarea row]                          [×]        │
│  [● textarea row]                          [×]        │
│  [+ Add highlight]                                    │
│                                                       │
│  Suggested from web research:                         │
│  [chip] [chip] [chip]    ← click to insert as field   │
│                                                       │
│                               [✓ Saved] / [Save]      │
└──────────────────────────────────────────────────────┘
```

Suggestion chips show `enrichedData.responsibilities` items not already present in `fields`. Clicking a chip appends it as a new editable field and removes it from the chip list.

`transferableSkills` chips are shown below responsibilities chips in a lighter style (zinc-600) as context — clicking them also inserts as a highlight field.

---

### `OnboardingShell.tsx` — minor update

Replace `<ResumeStep>` with `<ImportCareerStep>`. Wire `onNext` / `onSkip` to the same step-navigation callbacks. Remove the `handleResumeUpload` wrapper (ImportCareerStep handles the full flow internally).

---

### `server/resume-imports.ts` — one addition

```ts
export const updateCareerEntryFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    id:      z.string().uuid(),
    rawData: z.record(z.string(), jsonValueSchema),
  }))
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<CareerEntry>(
      `/resume-imports/career-entries/${data.id}`,
      { method: 'PUT', body: { rawData: data.rawData },
        pathTemplate: '/resume-imports/career-entries/:id' },
    )
  })
```

---

## Polling Strategy

In the `enhance` phase, `ImportCareerStep` polls `listCareerEntriesFn()` with `refetchInterval`:

```ts
refetchInterval: (query) => {
  const entries = query.state.data ?? []
  const experienceEntries = entries.filter(e => e.entryType === 'experience')
  const allTerminal = experienceEntries.every(e =>
    ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus)
  )
  return allTerminal ? false : 3000
}
```

Each `EnhanceRoleCard` reads its own entry from the polled list. No per-entry query needed.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `updateCareerEntryFn` fails | Toast error, card stays in editing state, retry available |
| Enrichment status stays `enriching` > 3 min | Card shows "Taking longer than expected. You can edit manually." + stops spinner |
| All entries `skipped`/`failed` | Enhance phase still renders; user can edit existing highlights manually |
| User skips enhance entirely | No data saved, pipeline already wrote `raw_data` from extraction |

---

## Files Changed

| File | Change |
|---|---|
| `src/features/onboarding/components/steps/ImportCareerStep.tsx` | Add `enhance` phase + `EnhanceRoleCard` import |
| `src/features/onboarding/components/steps/EnhanceRoleCard.tsx` | New component |
| `src/features/onboarding/components/onboarding/OnboardingShell.tsx` | Swap `ResumeStep` → `ImportCareerStep` |
| `src/server/resume-imports.ts` | Add `updateCareerEntryFn` |
| `src/features/onboarding/components/onboarding/ResumeStep.tsx` | No change (kept for potential reuse) |

---

## Out of Scope

- Dashboard career history editor (separate feature)
- Bulk accept/reject all suggestions
- Re-running enrichment on demand
- Education / skill / certification gap analysis (experience only)
