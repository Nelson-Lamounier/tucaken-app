# Standard Evidence Representation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Research Agent's verified-matches evidence through one shared flip-card deck across the Applied / Phone Screen / Technical stages, and ground the Coach's phone-screen talking points to specific verified matches so they cannot contradict the research.

**Architecture:** A single presentational `EvidenceDeck` + `EvidenceFlipCard` primitive (extracted from Technical's `TopicsPanel`) consumes a stage-built `EvidenceCard[]`. Each stage maps its slice of `research` (+ Coach talking points for Phone) into that array. Upstream, `PhoneScreenTalkingPoint` gains `matchedSkills: string[]`, enforced by a fail-closed grounding guard that intersects them with `research.verifiedMatches`.

**Tech Stack:** TanStack Start + React 19, Tailwind v4, Motion, Vitest (tucaken-app); Bedrock tool-use + Zod, Jest, yarn workspaces (ai-applications / `@bedrock/shared` + `job-strategist`).

---

## File Structure

**tucaken-app**
- Create `src/features/applications/stages/components/EvidenceDeck.tsx` — shared deck + flip card + strength maps + `EvidenceCard` type. One responsibility: present a deck of evidence flip cards.
- Modify `src/lib/types/applications.types.ts` — `PhoneScreenTalkingPoint.matchedSkills?`.
- Modify `src/features/applications/stages/workspaces/TechnicalWorkspace.tsx` — `TopicsPanel` uses `EvidenceDeck`; remove the local flip-card/constants.
- Modify `src/features/applications/stages/workspaces/AppliedWorkspace.tsx` — retire `VerifiedMatchCard`, render verified matches via `EvidenceDeck`.
- Modify `src/features/applications/stages/workspaces/PhoneScreenWorkspace.tsx` — `TalkingPointsPanel` uses `EvidenceDeck`; chips for `matchedSkills`; fallback to verified matches.
- Tests under `src/__tests__/features/applications/`.

**ai-applications**
- Modify `applications/shared/src/strategist-types.ts` (+ `index.ts` export) — `PhoneScreenTalkingPoint.matchedSkills`.
- Modify `applications/job-strategist/src/agents/coach-agent.ts` — tool schema + Zod + grounding guard.
- Create `applications/job-strategist/src/lib/ground-talking-points.ts` — the pure grounding helper.
- Modify `applications/job-strategist/src/prompts/coach/stages/phone-screen.ts` — prompt instruction.
- Modify `applications/job-strategist/src/evals/fixtures/phone-screen.json`.

---

## Task 1: Frontend contract — `matchedSkills` on `PhoneScreenTalkingPoint`

**Files:**
- Modify: `src/lib/types/applications.types.ts` (the `PhoneScreenTalkingPoint` interface, ~line 438)

- [ ] **Step 1: Add the optional field**

In `PhoneScreenTalkingPoint`:

```ts
export interface PhoneScreenTalkingPoint {
  readonly point: string
  readonly evidence: string
  /** Verified-match skills this point draws on (one-to-many). Empty/absent on legacy rows. */
  readonly matchedSkills?: readonly string[]
}
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`
Expected: passes (field is optional; no consumers break).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/applications.types.ts
git commit -m "feat(applications): add matchedSkills to PhoneScreenTalkingPoint"
```

---

## Task 2: Shared `EvidenceDeck` primitive

**Files:**
- Create: `src/features/applications/stages/components/EvidenceDeck.tsx`
- Test: `src/__tests__/features/applications/evidence-deck.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EvidenceDeck, type EvidenceCard } from '@/features/applications/stages/components/EvidenceDeck'

const CARDS: EvidenceCard[] = [
  { id: 'k8s', title: 'Kubernetes', strength: 'strong', backLabel: 'Evidence', hint: 'Flip', back: <p>cluster work</p> },
  { id: 'rust', title: 'Rust', strength: 'none', backLabel: 'Gap', hint: 'Flip', back: <p>no evidence</p> },
]

describe('EvidenceDeck', () => {
  it('renders a titled deck with a card per item and a count', () => {
    render(<EvidenceDeck title="Topics" subtitle="sub" cards={CARDS} />)
    expect(screen.getByText('Topics')).toBeTruthy()
    expect(screen.getByText('Kubernetes')).toBeTruthy()
    expect(screen.getByText('Rust')).toBeTruthy()
    expect(screen.getByLabelText('Strong evidence')).toBeTruthy()
    expect(screen.getByLabelText('Gap')).toBeTruthy()
  })

  it('reveals the back content on click', () => {
    render(<EvidenceDeck title="Topics" subtitle="sub" cards={CARDS} />)
    expect(screen.getByText('cluster work')).toBeTruthy() // back is in DOM (CSS flip)
  })

  it('shows the empty state when there are no cards', () => {
    render(<EvidenceDeck title="Topics" subtitle="sub" cards={[]} emptyState={<p>nothing yet</p>} />)
    expect(screen.getByText('nothing yet')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run src/__tests__/features/applications/evidence-deck.test.tsx`
Expected: FAIL — cannot resolve `EvidenceDeck`.

- [ ] **Step 3: Create the component**

```tsx
'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { RotateCw, CheckCircle2, CircleDashed, CircleSlash } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TONE, type Tone } from '@/components/ui/tone'
import { Card } from '@/components/ui/Card'
import type { EvidenceStrength } from '../types/workspace'

const FLIP_SPRING = { type: 'spring', visualDuration: 0.45, bounce: 0.18 } as const
const FACE = 'absolute inset-0 flex flex-col rounded-md border p-4 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]'

const STRENGTH_TONE: Record<EvidenceStrength, Tone> = { strong: 'good', moderate: 'warn', none: 'bad' }
const STRENGTH_BORDER: Record<EvidenceStrength, string> = {
  strong:   'border-emerald-200 dark:border-emerald-500/30',
  moderate: 'border-amber-200 dark:border-amber-500/30',
  none:     'border-red-200 dark:border-red-500/30',
}
const STRENGTH_ICON: Record<EvidenceStrength, LucideIcon> = { strong: CheckCircle2, moderate: CircleDashed, none: CircleSlash }
const STRENGTH_LABEL: Record<EvidenceStrength, string> = { strong: 'Strong evidence', moderate: 'Some evidence', none: 'Gap' }

/** One card in a deck. `back` is any node (text, chips, links). */
export interface EvidenceCard {
  readonly id: string
  readonly title: string
  readonly strength: EvidenceStrength
  readonly backLabel: string
  readonly hint: string
  readonly back: ReactNode
}

function EvidenceFlipCard({ card }: { readonly card: EvidenceCard }) {
  const reduce = useReducedMotion()
  const [flipped, setFlipped] = useState(false)
  const tone = STRENGTH_TONE[card.strength]
  const border = STRENGTH_BORDER[card.strength]
  const Icon = STRENGTH_ICON[card.strength]

  return (
    <button
      type="button"
      onClick={() => setFlipped(prev => !prev)}
      aria-pressed={flipped}
      className="h-44 w-full rounded-md text-left perspective-distant focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : FLIP_SPRING}
      >
        <div className={`${FACE} bg-white dark:bg-white/2 ${border}`}>
          <div className="flex items-center justify-between">
            <Icon className={`size-5 ${TONE[tone].dot}`} role="img" aria-label={STRENGTH_LABEL[card.strength]} />
            <RotateCw className="size-3.5 text-zinc-300 dark:text-zinc-600" aria-hidden />
          </div>
          <p className="mt-3 flex-1 text-base font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-100">{card.title}</p>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{card.hint}</span>
        </div>

        <div className={`${FACE} transform-[rotateY(180deg)] bg-zinc-50 dark:bg-white/5 ${border}`}>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase ${TONE[tone].text}`}>
            <Icon className="size-3.5" aria-hidden />
            {card.backLabel}
          </span>
          <div className="mt-1.5 flex-1 space-y-1.5 overflow-y-auto text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
            {card.back}
          </div>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
            <RotateCw className="size-3" aria-hidden /> Flip back
          </span>
        </div>
      </motion.div>
    </button>
  )
}

/** A titled deck of evidence flip cards — one shared representation across stages. */
export function EvidenceDeck({
  title,
  subtitle,
  cards,
  emptyState,
}: {
  readonly title: string
  readonly subtitle: string
  readonly cards: readonly EvidenceCard[]
  readonly emptyState?: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </div>
      {cards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => (
            <EvidenceFlipCard key={card.id} card={card} />
          ))}
        </div>
      ) : (
        emptyState ?? <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No evidence yet.</Card>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --run src/__tests__/features/applications/evidence-deck.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/stages/components/EvidenceDeck.tsx src/__tests__/features/applications/evidence-deck.test.tsx
git commit -m "feat(applications): add shared EvidenceDeck primitive"
```

---

## Task 3: Technical uses `EvidenceDeck`

**Files:**
- Modify: `src/features/applications/stages/workspaces/TechnicalWorkspace.tsx` (replace `TopicsPanel` + `TopicFlipCard` + strength maps/constants)
- Test: `src/__tests__/features/applications/workspaces/technical.test.tsx` (existing — keep green)

- [ ] **Step 1: Replace `TopicsPanel` with an EvidenceDeck mapping**

Remove the local `TOPIC_FLIP_SPRING`, `TOPIC_FACE`, `STRENGTH_TONE`, `STRENGTH_BORDER`, `STRENGTH_ICON`, `STRENGTH_LABEL`, `TopicFlipCard`, and `TopicsPanel`. Add:

```tsx
import { EvidenceDeck, type EvidenceCard } from '../components/EvidenceDeck'

function topicCard(topic: EvidenceTopicRow): EvidenceCard {
  const isGap = topic.strength === 'none'
  return {
    id: topic.id,
    title: topic.title,
    strength: topic.strength,
    backLabel: isGap ? 'Addressing the gap' : 'Evidence in your work',
    hint: isGap ? 'Flip to see how to address it' : 'Flip to see your evidence',
    back: <p>{isGap ? (topic.beHonest ?? topic.summary) : topic.summary}</p>,
  }
}

function TopicsPanel({ topics }: { readonly topics: readonly EvidenceTopicRow[] }) {
  return (
    <EvidenceDeck
      title="Topics likely to come up"
      subtitle="Grounded in the evidence found across your work for this role. Tap a card to reveal the evidence."
      cards={topics.map(topicCard)}
      emptyState={
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No analysis yet — topics appear once the Research Agent has run for this application.
        </Card>
      }
    />
  )
}
```

Remove now-unused imports (`motion`, `useReducedMotion`, `RotateCw`, `CheckCircle2`, `CircleDashed`, `CircleSlash`, `LucideIcon`, `TONE`, `Tone`) **only if** no other code in the file uses them — the DSA flip cards do, so keep what they need. Run typecheck to confirm which are still referenced.

- [ ] **Step 2: Run typecheck + the technical test**

Run: `yarn typecheck && yarn test --run src/__tests__/features/applications/workspaces/technical.test.tsx`
Expected: passes — the topics still render "Topics likely to come up" + topic titles; `getByLabelText('Strong evidence')` still resolves via the shared card.

- [ ] **Step 3: Commit**

```bash
git add src/features/applications/stages/workspaces/TechnicalWorkspace.tsx
git commit -m "refactor(applications): technical topics use shared EvidenceDeck"
```

---

## Task 4: Applied uses `EvidenceDeck` (verified lens)

**Files:**
- Modify: `src/features/applications/stages/workspaces/AppliedWorkspace.tsx` (retire `VerifiedMatchCard` + `VerifiedMatchesGroup` internals; render the deck)
- Test: `src/__tests__/features/applications/applied-evidence.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerifiedMatchesDeck } from '@/features/applications/stages/workspaces/AppliedWorkspace'
import type { VerifiedMatch } from '@/lib/types/applications.types'

const MATCHES: VerifiedMatch[] = [
  { skill: 'Kubernetes', sourceCitation: 'cdk-monitoring repo', depthBadge: 'deep', recency: '2025' },
]

describe('VerifiedMatchesDeck', () => {
  it('renders one card per verified match with citation on the back', () => {
    render(<VerifiedMatchesDeck matches={MATCHES} />)
    expect(screen.getByText('Kubernetes')).toBeTruthy()
    expect(screen.getByLabelText('Strong evidence')).toBeTruthy()
    expect(screen.getByText(/cdk-monitoring repo/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run src/__tests__/features/applications/applied-evidence.test.tsx`
Expected: FAIL — `VerifiedMatchesDeck` not exported.

- [ ] **Step 3: Replace the bespoke card with a deck mapping (export it for the test)**

Remove `VerifiedMatchCard`. Replace `VerifiedMatchesGroup` body. Add and export:

```tsx
import { EvidenceDeck, type EvidenceCard } from '../components/EvidenceDeck'

function matchCard(match: VerifiedMatch): EvidenceCard {
  return {
    id: match.skill,
    title: match.skill,
    strength: 'strong',
    backLabel: 'Verified in your work',
    hint: 'Flip to see the source',
    back: (
      <>
        <p>{match.sourceCitation}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{match.depthBadge} · {match.recency}</p>
      </>
    ),
  }
}

export function VerifiedMatchesDeck({ matches }: { readonly matches: readonly VerifiedMatch[] }) {
  return (
    <EvidenceDeck
      title="Verified matches"
      subtitle="Skills proven by your own work, ready to lead with. Tap a card to see the source."
      cards={matches.map(matchCard)}
    />
  )
}
```

Replace the render site `{verifiedMatches.length > 0 && <VerifiedMatchesGroup matches={verifiedMatches} />}` with `{verifiedMatches.length > 0 && <VerifiedMatchesDeck matches={verifiedMatches} />}`. Remove now-unused imports if any (`SummaryRow`/`SummaryGroup` may still be used elsewhere — check).

- [ ] **Step 4: Run test + typecheck**

Run: `yarn typecheck && yarn test --run src/__tests__/features/applications/applied-evidence.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/stages/workspaces/AppliedWorkspace.tsx src/__tests__/features/applications/applied-evidence.test.tsx
git commit -m "refactor(applications): applied verified matches use shared EvidenceDeck"
```

---

## Task 5: Phone Screen uses `EvidenceDeck` (talking-points lens + chips + fallback)

**Files:**
- Modify: `src/features/applications/stages/workspaces/PhoneScreenWorkspace.tsx` (replace `TalkingPointCard` + `TalkingPointsPanel`)
- Test: `src/__tests__/features/applications/phone-talking-points.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TalkingPointsPanel } from '@/features/applications/stages/workspaces/PhoneScreenWorkspace'

describe('TalkingPointsPanel', () => {
  it('renders coach talking points with matched-skill chips', () => {
    render(<TalkingPointsPanel jdPoints={[{ point: 'Owns end-to-end AWS delivery', evidence: 'AI pipeline', matchedSkills: ['AWS', 'CDK'] }]} fallbackPoints={[]} />)
    expect(screen.getByText('Owns end-to-end AWS delivery')).toBeTruthy()
    expect(screen.getByText('AWS')).toBeTruthy()
    expect(screen.getByText('CDK')).toBeTruthy()
  })

  it('falls back to verified-match skills when no coach points', () => {
    render(<TalkingPointsPanel jdPoints={[]} fallbackPoints={['Kubernetes']} />)
    expect(screen.getByText('Kubernetes')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run src/__tests__/features/applications/phone-talking-points.test.tsx`
Expected: FAIL — new `TalkingPointsPanel` shape / chips not present.

- [ ] **Step 3: Rewrite `TalkingPointsPanel` over the deck**

Replace `TalkingPointCard` and `TalkingPointsPanel`. The `PointCard` interface gains `matchedSkills`. Map to `EvidenceCard` (all `strength: 'strong'`):

```tsx
import { EvidenceDeck, type EvidenceCard } from '../components/EvidenceDeck'
import type { PhoneScreenTalkingPoint } from '@/lib/types/applications.types'

function Chips({ skills }: { readonly skills: readonly string[] }) {
  if (skills.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {skills.map(s => (
        <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
          {s}
        </span>
      ))}
    </div>
  )
}

export function TalkingPointsPanel({
  jdPoints,
  fallbackPoints,
}: {
  readonly jdPoints: readonly PhoneScreenTalkingPoint[]
  readonly fallbackPoints: readonly string[]
}) {
  const cards: EvidenceCard[] =
    jdPoints.length > 0
      ? jdPoints.map(tp => ({
          id: tp.point,
          title: tp.point,
          strength: 'strong' as const,
          backLabel: 'How to say it',
          hint: 'Flip to see your evidence',
          back: (
            <>
              <p>{tp.evidence}</p>
              <Chips skills={tp.matchedSkills ?? []} />
            </>
          ),
        }))
      : fallbackPoints.map(point => ({
          id: point,
          title: point,
          strength: 'strong' as const,
          backLabel: 'Verified strength',
          hint: 'Lead with this confidently',
          back: <p>A verified strength from your own work — lead with it confidently.</p>,
        }))

  return (
    <EvidenceDeck
      title="Your talking points"
      subtitle="Strengths to lead with, from your verified evidence. Tap a card to test your recall."
      cards={cards}
      emptyState={
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Talking points appear once the Research Agent has analysed this application.
        </Card>
      }
    />
  )
}
```

Keep the call site `<TalkingPointsPanel jdPoints={jdPoints} fallbackPoints={talkingPoints} />` unchanged. Remove now-unused `Lightbulb`, `FLIP_SPRING`, `FACE`, `PointCard`, `TalkingPointCard` (and the `motion`/`useReducedMotion`/`RotateCw` imports if nothing else in the file uses them — verify with typecheck).

- [ ] **Step 4: Run test + typecheck**

Run: `yarn typecheck && yarn test --run src/__tests__/features/applications/phone-talking-points.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Full frontend gate + commit**

Run: `yarn lint && yarn test && yarn build`
Expected: 0 lint errors, all tests pass, build ok.

```bash
git add src/features/applications/stages/workspaces/PhoneScreenWorkspace.tsx src/__tests__/features/applications/phone-talking-points.test.tsx
git commit -m "refactor(applications): phone talking points use shared EvidenceDeck + matchedSkills chips"
```

---

## Task 6: Shared type `matchedSkills` (ai-applications)

**Files:**
- Modify: `applications/shared/src/strategist-types.ts` (`PhoneScreenTalkingPoint`)

- [ ] **Step 1: Add the field**

```ts
export interface PhoneScreenTalkingPoint {
    readonly point: string;
    readonly evidence: string;
    /** Verified-match skills this point draws on. Every entry is a research verifiedMatch skill. */
    readonly matchedSkills?: readonly string[];
}
```

- [ ] **Step 2: Build shared + typecheck**

Run: `yarn workspace @bedrock/shared build && yarn workspace @bedrock/job-strategist typecheck`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add applications/shared/src/strategist-types.ts
git commit -m "feat(shared): add matchedSkills to PhoneScreenTalkingPoint"
```

---

## Task 7: Coach tool schema + Zod for `matchedSkills`

**Files:**
- Modify: `applications/job-strategist/src/agents/coach-agent.ts` (the `jdTalkingPoints` tool-schema items ~line 183, and the Zod `jdTalkingPoints` ~line 414)

- [ ] **Step 1: Tool schema — add `matchedSkills`**

```ts
jdTalkingPoints: {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            point:        { type: 'string' },
            evidence:     { type: 'string' },
            matchedSkills:{ type: 'array', items: { type: 'string' } },
        },
        required: ['point', 'evidence', 'matchedSkills'],
        additionalProperties: false,
    },
},
```

- [ ] **Step 2: Zod — add `matchedSkills` (default [])**

```ts
jdTalkingPoints: z.array(z.object({
    point:        z.string(),
    evidence:     z.string(),
    matchedSkills: z.array(z.string()).default([]),
}).strict()).optional(),
```

- [ ] **Step 3: Typecheck**

Run: `yarn workspace @bedrock/job-strategist typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add applications/job-strategist/src/agents/coach-agent.ts
git commit -m "feat(coach): accept matchedSkills on jdTalkingPoints"
```

---

## Task 8: Grounding guard — intersect `matchedSkills` with verified matches

**Files:**
- Create: `applications/job-strategist/src/lib/ground-talking-points.ts`
- Test: `applications/job-strategist/src/lib/ground-talking-points.test.ts`
- Modify: `applications/job-strategist/src/agents/coach-agent.ts` (call it in `parseResponse`/post-parse, where `verifiedMatches` from the analysis input is available)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { groundTalkingPoints } from './ground-talking-points.js';

describe('groundTalkingPoints', () => {
  const verified = ['AWS', 'CDK', 'Kubernetes'];

  it('keeps only matchedSkills that are verified', () => {
    const out = groundTalkingPoints(
      [{ point: 'Owns AWS delivery', evidence: 'pipeline', matchedSkills: ['AWS', 'Rust'] }],
      verified,
    );
    expect(out).toHaveLength(1);
    expect(out[0].matchedSkills).toEqual(['AWS']);
  });

  it('drops a talking point whose skills are all unverified', () => {
    const out = groundTalkingPoints(
      [{ point: 'Knows Rust', evidence: 'x', matchedSkills: ['Rust'] }],
      verified,
    );
    expect(out).toHaveLength(0);
  });

  it('passes through points with no matchedSkills (legacy)', () => {
    const out = groundTalkingPoints(
      [{ point: 'General fit', evidence: 'x', matchedSkills: [] }],
      verified,
    );
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd applications/job-strategist && NODE_OPTIONS=--experimental-vm-modules yarn jest src/lib/ground-talking-points.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
/** @format */
import type { PhoneScreenTalkingPoint } from '@bedrock/shared';

/**
 * Fail-closed grounding for phone-screen talking points: every matchedSkills
 * entry must be a research verified-match skill. Unverified skills are dropped;
 * a point keeps surviving only if it still cites ≥1 verified skill OR cited none
 * to begin with (legacy / general points). Case-insensitive match.
 */
export function groundTalkingPoints(
    points: readonly PhoneScreenTalkingPoint[],
    verifiedSkills: readonly string[],
): PhoneScreenTalkingPoint[] {
    const verified = new Set(verifiedSkills.map(s => s.trim().toLowerCase()));
    const out: PhoneScreenTalkingPoint[] = [];
    for (const p of points) {
        const cited = p.matchedSkills ?? [];
        if (cited.length === 0) { out.push(p); continue; }
        const kept = cited.filter(s => verified.has(s.trim().toLowerCase()));
        if (kept.length === 0) continue;
        out.push({ ...p, matchedSkills: kept });
    }
    return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd applications/job-strategist && NODE_OPTIONS=--experimental-vm-modules yarn jest src/lib/ground-talking-points.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into the coach agent**

In `coach-agent.ts`, after the result is validated and before returning, when `jdTalkingPoints` is present, ground it against the research verified matches taken from the agent input analysis. Locate where the validated result is assembled (the `parseResponse` return / `executeCoachAgent` post-step that already has the analysis). Add:

```ts
import { groundTalkingPoints } from '../lib/ground-talking-points.js';
// ... where `validated.jdTalkingPoints` exists and the research verifiedMatches are in scope:
const verifiedSkills = (research?.verifiedMatches ?? []).map(m => m.skill);
const jdTalkingPoints = validated.jdTalkingPoints
    ? groundTalkingPoints(validated.jdTalkingPoints, verifiedSkills)
    : validated.jdTalkingPoints;
return { ...validated, jdTalkingPoints, stage: ctx.interviewStage };
```

If `research` is not already threaded into `parseResponse`, thread the verified-match skills via the existing input/context the agent has (the same source `extractCoachClaims` uses for grounding). Run typecheck to confirm the binding.

- [ ] **Step 6: Typecheck + targeted tests**

Run: `yarn workspace @bedrock/job-strategist typecheck && cd applications/job-strategist && NODE_OPTIONS=--experimental-vm-modules yarn jest src/agents/coach-agent.test.ts src/lib/ground-talking-points.test.ts`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add applications/job-strategist/src/lib/ground-talking-points.ts applications/job-strategist/src/lib/ground-talking-points.test.ts applications/job-strategist/src/agents/coach-agent.ts
git commit -m "feat(coach): ground jdTalkingPoints to verified matches (fail-closed)"
```

---

## Task 9: Prompt instruction (phone-screen delta)

**Files:**
- Modify: `applications/job-strategist/src/prompts/coach/stages/phone-screen.ts`

- [ ] **Step 1: Update the jdTalkingPoints bullet**

Replace the `jdTalkingPoints` line with:

```ts
`  - jdTalkingPoints — strongest VERIFIED matches vs the JD; each`,
`    {point, evidence, matchedSkills}. Build each point from one or more VERIFIED`,
`    matches and list every skill it draws on in matchedSkills. NEVER cite a skill`,
`    that is not in the verified matches.`,
```

- [ ] **Step 2: Typecheck**

Run: `yarn workspace @bedrock/job-strategist typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add applications/job-strategist/src/prompts/coach/stages/phone-screen.ts
git commit -m "feat(coach): prompt jdTalkingPoints to cite verified matchedSkills"
```

---

## Task 10: Fixtures + full suites (ai-applications)

**Files:**
- Modify: `applications/job-strategist/src/evals/fixtures/phone-screen.json` (add `matchedSkills` to its `jdTalkingPoints`)

- [ ] **Step 1: Update the fixture's jdTalkingPoints**

Set the phone-screen fixture's `output.jdTalkingPoints` entries to include `matchedSkills` drawn from the fixture's verified matches, e.g.:

```json
"jdTalkingPoints": [
  { "point": "Owns end-to-end AWS delivery", "evidence": "AI Applications pipeline", "matchedSkills": ["AWS"] }
]
```

(Use a skill that exists in that fixture's research verified matches so the grounding guard keeps it.)

- [ ] **Step 2: Run both ai-applications suites**

Run: `cd applications/job-strategist && NODE_OPTIONS=--experimental-vm-modules yarn jest` then `cd ../shared && NODE_OPTIONS=--experimental-vm-modules yarn jest`
Expected: job-strategist + shared suites all pass.

- [ ] **Step 3: Commit**

```bash
git add applications/job-strategist/src/evals/fixtures/phone-screen.json
git commit -m "test(coach): structured matchedSkills in phone-screen fixture"
```

---

## Self-review notes

- **Spec coverage:** §1 shared primitive → Task 2; §2 lenses → Tasks 3 (Technical), 4 (Applied), 5 (Phone); §3 contract → Tasks 1/6/7, grounding → Task 8, prompt → Task 9; backward compat → optional field (Tasks 1, 6) + fallback (Task 5) + `.default([])` (Task 7); fixtures/testing → Tasks 5/8/10.
- **Type consistency:** `EvidenceCard` shape (id/title/strength/backLabel/hint/back) is identical in Tasks 2–5; `matchedSkills` optional in both repos; `groundTalkingPoints(points, verifiedSkills)` signature matches its test and call site.
- **Rollout:** Frontend (Tasks 1–5) is backward-compatible and ships first; ai-applications (Tasks 6–10) follows and needs a Coach pipeline redeploy to populate `matchedSkills`. No DB migration.
