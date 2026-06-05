# System Design walkthrough UI (design)

**Date:** 2026-06-05
**Status:** Design — approved (layout: all-expanded)
**Repo:** tucaken-app (frontend)
**Scope:** Render the coach-generated `systemDesignWalkthrough` in `SystemDesignWorkspace`, replacing the hardcoded placeholder content. Backend already produces + persists it; the UI just never read it.

## 1. Problem

The System Design coach (ai-applications PR #132) generates a grounded, project-anchored
`systemDesignWalkthrough` (one card per JD-relevant concern) and persists it to
`coaching_content.topics_to_study`. The detail endpoint already surfaces it on
`ApplicationDetail.coaching['system-design'].topics.systemDesignWalkthrough`.

But `SystemDesignWorkspace.tsx` **never reads that field**. It renders hardcoded
`QUESTION_PATTERNS` ("Design a high-write system…") + a generic 6-step `FRAMEWORK` + the separate
`SystemTours` feature. So users see generic placeholder text instead of their real, grounded
walkthrough — the "why isn't my generated data showing" gap. (Verified live: app c2156165 has a
full 7-card grounded walkthrough in the DB; the UI shows none of it.)

## 2. Data (already available — no plumbing)

`resolveStagePrep(detail, 'system-design')` (existing helper, `stages/types/workspace.ts:181`)
returns the stage's full coach output. From it:
- `systemDesignWalkthrough: SystemDesignCard[]`
- `systemDesignCoverage: { relevantTotal, relevantAddressed, detected[] }`

These fields are **not yet typed** in `applications.types.ts` — add them.

### Card shape (`SystemDesignCard`)
```ts
interface EvidenceRef { source: string; id: string; label: string; fileLine?: string }
interface SystemDesignFollowUp { question: string; status: 'addressed' | 'partial' | 'gap'; framing: string }
interface SystemDesignCard {
  concernId: string
  concernQuestion: string
  whyItMatters: string
  evidenceRefs: EvidenceRef[]
  choiceMade: string | null
  articulation: string
  followUps: SystemDesignFollowUp[]
  gapGuidance: string | null
}
interface SystemDesignCoverage { relevantTotal: number; relevantAddressed: number }
```

## 3. Components

**New: `stages/workspaces/SystemDesignWalkthrough.tsx`** — pure presentational, owns the card
rendering (keeps `SystemDesignWorkspace` focused). Props: `{ cards: SystemDesignCard[]; coverage?: SystemDesignCoverage | null }`.

**Edit: `SystemDesignWorkspace.tsx`** — read `resolveStagePrep(detail, 'system-design')`, extract
the walkthrough; if present, render `<SystemDesignWalkthrough>` as the **primary** section and
**remove** the hardcoded `QUESTION_PATTERNS` block. Keep the 6-step `FRAMEWORK` as a secondary
"Practice framework" section and the existing `SystemTours` group unchanged.

**Edit: `lib/types/applications.types.ts`** — add the types above; extend the coaching `topics`
type (InterviewCoachResult) with optional `systemDesignWalkthrough` + `systemDesignCoverage`.

## 4. Layout (all-expanded)

- **Coverage header** — `SummaryGroup` titled "System Design walkthrough", subtitle e.g.
  "7 of 7 role-relevant concerns, grounded in your project work." (from coverage).
- **One `Card` per concern**, fully expanded:
  - Header row: `concernQuestion` + a badge — **Grounded** (green) when `evidenceRefs.length > 0`,
    **Gap** (amber) when `choiceMade === null` / no evidence.
  - `whyItMatters` — small muted line under the header.
  - **Your choice** — `choiceMade` (omit the label block when null).
  - **Rehearsal script** — `articulation`, rendered with preserved line breaks (it's multi-paragraph
    first-person prose). This is the primary content.
  - **Follow-ups** — list; each shows a status chip (`addressed` green / `partial` amber / `gap` red)
    + the question + `framing`.
  - **Evidence** — `evidenceRefs` as small chips (`label`; tooltip/secondary line = `fileLine` when set).
  - **Gap guidance** — `gapGuidance` in an amber callout when present.
- Reuse existing primitives: `Card`, `SummaryGroup`/`SummaryRow`, `CollapsibleSection` (for the
  secondary framework), and the badge/chip styles already used by sibling workspaces.

## 5. Empty / loading states

- No walkthrough yet (`resolveStagePrep` null or `systemDesignWalkthrough` empty) → keep the
  current teaser: the 6-step framework + an honest "Generate System Design prep to see your
  grounded walkthrough here" note. (Don't show the old generic `QUESTION_PATTERNS`.)
- `prep_status` gating (queued/ready/failed) stays with `StagePrepGate` upstream — unchanged.

## 6. Testing

- Update `src/__tests__/features/applications/stage-components.test.tsx` (or add) to cover:
  rendering a walkthrough with grounded + gap cards, the coverage header, and the empty state.
- Lint + typecheck clean.

## 7. Out of scope

- Backend (done — coach produces + persists the walkthrough).
- `SystemTours` (separate `project_system_tours` feature) — left as-is.
- A "Regenerate" CTA for a successful prep (separate UX gap noted earlier) — not this change.
- The coach also emits technical/behavioural/difficult question arrays for system-design; ignore
  them here (the walkthrough is the system-design surface).
