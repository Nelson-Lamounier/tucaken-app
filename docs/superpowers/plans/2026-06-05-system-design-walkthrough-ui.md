# System Design Walkthrough UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the coach-generated, project-grounded `systemDesignWalkthrough` (one card per JD-relevant concern) in `SystemDesignWorkspace`, all-expanded, replacing the hardcoded `QUESTION_PATTERNS` placeholder.

**Architecture:** The data already reaches the component via `detail.coaching['system-design'].topics` (use `resolveStagePrep`). Add the types, build a focused presentational `SystemDesignWalkthrough` component, and wire it into `SystemDesignWorkspace` as the primary section (with the generic placeholder demoted to an empty-state fallback).

**Tech Stack:** React + TypeScript (tucaken-app frontend), TanStack Router, existing workspace primitives (`Card`, `SummaryGroup`, `CollapsibleSection`), Vitest/RTL tests. Repo is `main`-based; work on `feat/system-design-walkthrough-ui` (off `main`), PR base `main`.

**Spec:** `docs/superpowers/specs/2026-06-05-system-design-walkthrough-ui-design.md`

---

## File Structure

- **Modify** `src/lib/types/applications.types.ts` — add `EvidenceRef`, `SystemDesignFollowUp`, `SystemDesignCard`, `SystemDesignCoverage`; extend the coach topics interface (the one holding `technicalQuestions`/`compScript`/etc.) with optional `systemDesignWalkthrough` + `systemDesignCoverage`.
- **Create** `src/features/applications/stages/workspaces/SystemDesignWalkthrough.tsx` — presentational card renderer.
- **Modify** `src/features/applications/stages/workspaces/SystemDesignWorkspace.tsx` — read the walkthrough, render it, gate the placeholder to empty-state.
- **Modify** `src/__tests__/features/applications/stage-components.test.tsx` — cover walkthrough render + empty state.

---

## Task 1: Type the walkthrough shape

**Files:** Modify `src/lib/types/applications.types.ts`

- [ ] **Step 1: Add the card types** near the existing coach/`SystemTour` types:

```ts
export interface EvidenceRef {
  readonly source: string
  readonly id: string
  readonly label: string
  readonly fileLine?: string
}

export type SystemDesignFollowUpStatus = 'addressed' | 'partial' | 'gap'

export interface SystemDesignFollowUp {
  readonly question: string
  readonly status: SystemDesignFollowUpStatus
  readonly framing: string
}

export interface SystemDesignCard {
  readonly concernId: string
  readonly concernQuestion: string
  readonly whyItMatters: string
  readonly evidenceRefs: readonly EvidenceRef[]
  readonly choiceMade: string | null
  readonly articulation: string
  readonly followUps: readonly SystemDesignFollowUp[]
  readonly gapGuidance: string | null
}

export interface SystemDesignCoverage {
  readonly relevantTotal: number
  readonly relevantAddressed: number
}
```

- [ ] **Step 2: Extend the coach topics interface** — find the interface whose `topics` is described as "the FULL InterviewCoachResult JSON" (it lists `behaviouralQuestions`, `difficultQuestions`, `compScript?`, etc.). Add two optional fields:

```ts
  readonly systemDesignWalkthrough?: readonly SystemDesignCard[]
  readonly systemDesignCoverage?: SystemDesignCoverage
```

- [ ] **Step 3: Typecheck** — `yarn workspace @repo/tucaken-app typecheck` (or the repo's typecheck script). Expected: clean.

- [ ] **Step 4: Commit** — `git add src/lib/types/applications.types.ts && git commit -m "feat(types): system-design walkthrough card + coverage types"`

---

## Task 2: Build the `SystemDesignWalkthrough` component

**Files:** Create `src/features/applications/stages/workspaces/SystemDesignWalkthrough.tsx`

- [ ] **Step 1: Write a failing test** in `src/__tests__/features/applications/stage-components.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { SystemDesignWalkthrough } from '@/features/applications/stages/workspaces/SystemDesignWalkthrough'
import type { SystemDesignCard } from '@/lib/types/applications.types'

const grounded: SystemDesignCard = {
  concernId: 'api', concernQuestion: 'Why this API style?', whyItMatters: 'It matters.',
  evidenceRefs: [{ source: 'tech', id: 'zod', label: 'Zod', fileLine: 'a.ts:1' }],
  choiceMade: 'REST + Zod', articulation: 'I chose REST because…',
  followUps: [{ question: 'Idempotency?', status: 'addressed', framing: 'Conditional writes.' }],
  gapGuidance: null,
}
const gap: SystemDesignCard = {
  concernId: 'scale', concernQuestion: 'How does it scale?', whyItMatters: 'Load.',
  evidenceRefs: [], choiceMade: null, articulation: 'No evidence yet; I would…',
  followUps: [{ question: 'Stateless?', status: 'gap', framing: 'Not built yet.' }],
  gapGuidance: 'Be honest about the gap.',
}

it('renders grounded + gap cards with coverage', () => {
  render(<SystemDesignWalkthrough cards={[grounded, gap]} coverage={{ relevantTotal: 2, relevantAddressed: 1 }} />)
  expect(screen.getByText('Why this API style?')).toBeInTheDocument()
  expect(screen.getByText(/I chose REST/)).toBeInTheDocument()
  expect(screen.getByText('Grounded')).toBeInTheDocument()
  expect(screen.getByText('Gap')).toBeInTheDocument()
  expect(screen.getByText('Zod')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it — expect FAIL** (module not found): `yarn test stage-components`

- [ ] **Step 3: Implement the component.** Match the house style — reuse `Card` and the badge/chip classes used by sibling workspaces (`PhoneScreenWorkspace.tsx`, `BehaviouralWorkspace.tsx`) rather than inventing new primitives. Structure:

```tsx
import { Card } from '@/components/ui/Card'
import { SummaryGroup } from '../components/workspace-shell'
import type { SystemDesignCard, SystemDesignCoverage, SystemDesignFollowUpStatus } from '@/lib/types/applications.types'

const STATUS_STYLE: Record<SystemDesignFollowUpStatus, string> = {
  addressed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  partial:   'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  gap:       'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

function ConcernCard({ card }: { readonly card: SystemDesignCard }) {
  const grounded = card.evidenceRefs.length > 0 && card.choiceMade !== null
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{card.concernQuestion}</h4>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${grounded ? STATUS_STYLE.addressed : STATUS_STYLE.partial}`}>
          {grounded ? 'Grounded' : 'Gap'}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{card.whyItMatters}</p>
      {card.choiceMade && (
        <p className="text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">Your choice: </span>{card.choiceMade}</p>
      )}
      {/* Rehearsal script — preserve the model's paragraph breaks */}
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{card.articulation}</p>
      {card.gapGuidance && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">{card.gapGuidance}</p>
      )}
      {card.followUps.length > 0 && (
        <ul className="space-y-1.5">
          {card.followUps.map((f, i) => (
            <li key={i} className="text-xs">
              <span className={`mr-2 rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[f.status]}`}>{f.status}</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{f.question}</span>
              <span className="text-zinc-500 dark:text-zinc-400"> — {f.framing}</span>
            </li>
          ))}
        </ul>
      )}
      {card.evidenceRefs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {card.evidenceRefs.map((e, i) => (
            <span key={i} title={e.fileLine} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{e.label}</span>
          ))}
        </div>
      )}
    </Card>
  )
}

export function SystemDesignWalkthrough({
  cards, coverage,
}: { readonly cards: readonly SystemDesignCard[]; readonly coverage?: SystemDesignCoverage | null }) {
  const subtitle = coverage
    ? `${coverage.relevantAddressed} of ${coverage.relevantTotal} role-relevant concerns grounded in your project work.`
    : 'Concern-by-concern, grounded in your project work.'
  return (
    <SummaryGroup id="system-design-walkthrough" title="System Design walkthrough" subtitle={subtitle}>
      <div className="space-y-3">
        {cards.map(card => <ConcernCard key={card.concernId} card={card} />)}
      </div>
    </SummaryGroup>
  )
}
```

Confirm the actual `SummaryGroup` prop names (`title`/`subtitle`/`id`) and `Card` import path against a sibling workspace; adjust to match. Keep all Tailwind classes consistent with neighbours.

- [ ] **Step 4: Run the test — expect PASS**: `yarn test stage-components`

- [ ] **Step 5: Commit** — `git add src/features/applications/stages/workspaces/SystemDesignWalkthrough.tsx src/__tests__/features/applications/stage-components.test.tsx && git commit -m "feat(system-design): walkthrough card renderer"`

---

## Task 3: Wire it into `SystemDesignWorkspace`

**Files:** Modify `src/features/applications/stages/workspaces/SystemDesignWorkspace.tsx`

- [ ] **Step 1: Read the walkthrough + render it.** At the top of the `SystemDesignWorkspace` function body, after the existing `tours` line, add:

```tsx
  const prep = resolveStagePrep(detail, 'system-design')
  const walkthrough = prep?.systemDesignWalkthrough ?? []
  const coverage = prep?.systemDesignCoverage ?? null
```

Import `resolveStagePrep` from `'../types/workspace'` and `SystemDesignWalkthrough` from `'./SystemDesignWalkthrough'`.

In the returned JSX, **replace `<QuestionPatternsGroup />`** with:

```tsx
      {walkthrough.length > 0
        ? <SystemDesignWalkthrough cards={walkthrough} coverage={coverage} />
        : <QuestionPatternsGroup />}
```

So the real walkthrough shows when present; the generic patterns remain only as the empty-state. Leave `<SystemToursGroup>` and `<FrameworkGroup>` unchanged.

- [ ] **Step 2: Typecheck + lint** — `yarn workspace @repo/tucaken-app typecheck && yarn workspace @repo/tucaken-app lint` (or repo scripts). Expected: clean.

- [ ] **Step 3: Commit** — `git add src/features/applications/stages/workspaces/SystemDesignWorkspace.tsx && git commit -m "feat(system-design): render grounded walkthrough in workspace (was placeholder)"`

---

## Task 4: Verify + PR

- [ ] **Step 1: Full test + lint + typecheck** for the package — all green.

- [ ] **Step 2: Push + PR (base `main`)**

```bash
git push -u origin feat/system-design-walkthrough-ui
gh pr create --base main --head feat/system-design-walkthrough-ui \
  --title "feat(system-design): render the grounded walkthrough in the workspace" \
  --body "SystemDesignWorkspace never read the coach's systemDesignWalkthrough — it showed hardcoded QUESTION_PATTERNS. Render the real grounded cards (question, choice, rehearsal script, follow-ups, evidence, gap guidance), all-expanded, with the placeholder demoted to the empty-state. Data already flows via detail.coaching['system-design'].topics. Spec: docs/superpowers/specs/2026-06-05-system-design-walkthrough-ui-design.md"
```

- [ ] **Step 3: Note for the user** — this overlaps the workspace area of the active `feat/applications-workspace-master-detail` branch; flag potential merge coordination.

---

## Self-review notes
- Spec §2 (types) → Task 1; §3 (component + workspace edit) → Tasks 2–3; §4 (layout all-expanded) → Task 2's component; §5 (empty state) → Task 3's `walkthrough.length > 0` gate; §6 (testing) → Task 2 test.
- `SystemDesignCard` field names match the persisted JSON (`concernQuestion`, `choiceMade`, `articulation`, `followUps[].status`, `evidenceRefs[].label/fileLine`, `gapGuidance`) verified against the live DB.
- Reuse existing `Card`/`SummaryGroup` + sibling badge classes — confirm exact prop/import names against `PhoneScreenWorkspace.tsx` before finalizing (the code above is the structure; match the house primitives).
- No backend change. Generic placeholders demoted, not deleted (still the honest empty state).
