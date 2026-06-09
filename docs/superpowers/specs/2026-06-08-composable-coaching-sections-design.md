# Composable coaching sections

**Date:** 2026-06-08
**Repos:** ai-applications (Coach Agent), tucaken-app (frontend)
**Status:** Design approved

## Problem

`coachingNotes` was split into 7 fixed typed fields (`positioning`, `interviewFocus`,
`tacticalPrep`, `communication`, `mindset`, `debrief`, `finalCheckpoint`). That
schema is **lossy** — coach content like ESL notes, pronunciation tables, top-3
priorities, and logistics has no field, so it gets crammed into the fixed fields
or dropped. The user wants a **composable narrative** they can distribute across
the page (e.g. ESL note as the opener, priorities lower down), while keeping
**manipulable** pieces (the interactive checklist).

## Decision

`coachingNotes` becomes an **ordered list of self-contained sections**:

```ts
interface CoachingSection {
  readonly key: string                  // stable kebab-case id, e.g. "esl-coaching"
  readonly title: string                // human heading
  readonly body: string                 // markdown narrative
  readonly checklist?: readonly string[] // present => interactive, persisted checklist
}
// InterviewCoachResult.coachingNotes: readonly CoachingSection[]
```

- `body` is markdown — content kept whole, no CDATA.
- `key` is a stable slug so the UI can place a section anywhere (dynamic distribution).
- `checklist` present → that section renders as the interactive persisted checklist
  (the "manipulable like finalCheckpoint"). Any section, any stage.

Open-ended: the coach may emit new section types (logistics, mindset, war-stories)
without a schema change.

## Backward compatibility (frontend adapter only)

`parseCoachingSections(notes)` normalises every legacy shape to `CoachingSection[]`:
- already an array of sections → validated through;
- a plain string → `[{ key:"coaching-notes", title:"Coaching notes", body:<stripCdata(string)> }]`;
- the legacy 7-field object → each present field mapped to a section
  (`finalCheckpoint {items,note}` → `{ key:"final-checkpoint", body:note, checklist:items }`);
- undefined/empty → `[]`.

## Coach Agent (ai-applications)

- `@bedrock/shared` `CoachingSection` type; `InterviewCoachResult.coachingNotes:
  CoachingSection[]`. Remove the old `CoachingNotes`/`InterviewFocusItem` object
  and the inline `FinalCheckpoint`.
- Tool schema: `coachingNotes` → array of `{ key, title, body, checklist? }`
  objects; Zod mirror with a string→`[section]` coercion for robustness.
- Base prompt `[COACHING NOTES STRUCTURE]`: emit an ordered list of sections,
  each `{ key (kebab-case), title, body markdown, checklist? }`; fold the
  `[ESL COACHING]` / logistics / priorities content into sections.
- `coach-prose` / `coach-grounding` / `coaching-notes-text`: iterate each
  section's `body` (and checklist items) instead of fixed fields.
- Refresh fixtures to the sections array.

## Frontend (tucaken-app)

- `CoachingSection` type; `InterviewPrepOutput.coachingNotes:
  string | LegacyCoachingNotes | readonly CoachingSection[]`.
- `parseCoachingSections` returns `CoachingSection[]` (adapter above).
- New `CoachingNarrative` renderer: ordered sections; prose via `CoachMarkdown`,
  `checklist` sections via the existing `FinalChecklist` (keyed by `appKey` +
  `section.key`). Rendered as the per-stage intro (above the dashboard), each
  section a distinct titled block — not one saturated panel.
- Remove the 7-field UI: `CoachingGuidance` sections, `StagePositioning` banner
  (replaced by the narrative), and the coach-driven `interviewFocus` in
  "What to expect" (reverts to the static list).
- Keep `FinalChecklist` (now fed by a section's `checklist`), on every stage that
  has one.

## Out of scope / unchanged

EvidenceDeck (verified matches), `jdTalkingPoints.matchedSkills`, difficult/
technical/behavioural questions, walkthroughs, final prep, schedules. The live
Coach pipeline needs a redeploy to emit sections; the adapter covers existing rows.
