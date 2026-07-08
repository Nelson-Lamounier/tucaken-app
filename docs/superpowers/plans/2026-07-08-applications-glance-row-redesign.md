# Applications Glance Row Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Applied-stage application glance dashboard, move the ATS check panel to the wide left slot and stack a compacted Assessment tile + Skill-coverage donut on the right at matched combined height, with the JD panel dropping to a full-width row below.

**Architecture:** All changes live in `src/features/applications/components/StageGlancePanel.tsx` (the `ResearchGlance` function and the private `GlanceTile` / `LevelMeter` / `TileBody` / `ResearchCompareGraphic` components) plus a one-class tweak to `AtsPanel.tsx`. Compact sizing is an opt-in `compact` prop so every other stage renders unchanged. Spec: `docs/superpowers/specs/2026-07-08-applications-glance-row-redesign-design.md`.

**Tech Stack:** React 19, TanStack Start, Tailwind CSS v4 (container queries), Motion for React (`motion/react`), Vitest + Testing Library (happy-dom).

## Global Constraints

- Yarn 4 only: `yarn test`, `yarn lint`, `yarn typecheck` — never npm/npx.
- Import animation primitives from `motion/react`, never `framer-motion`.
- No nested ternaries (Sonar S3358) — use if/else assignments.
- Corner radius stays `rounded-md`; dark-mode variants must be preserved verbatim when copying class strings.
- UK English in comments and copy; no non-ASCII diacritics.
- ESLint cyclomatic complexity cap is 10 per function.
- Responsiveness is a requirement: layout responds to container width (`@container` / `@2xl:` variants), single-column stacking below the breakpoint, no horizontal overflow.
- Every commit follows the git-commit skill (tests + lint first, atomic staging, Conventional Commits, no AI co-author trailer) and the impact-commits skill for bodies.

---

### Task 1: Swap the glance row — ATS wide left, Assessment + Skill coverage stacked right

**Files:**

- Modify: `src/features/applications/components/StageGlancePanel.tsx:676-718` (the `ResearchGlance` function)
- Modify: `src/features/applications/stages/components/AtsPanel.tsx:64` (add `h-full` so the card fills the stretched wide slot)
- Test: `src/__tests__/features/applications/stage-glance-panel.test.tsx` (create)

**Interfaces:**

- Consumes: existing `StageGlancePanel({ detail, stage })` public export; `AtsPanel({ ats })`, `JdUnderstandingPanel({ jd })`, `RoleEmphasisPanel({ mix })`, `FitScorePanel({ fit })`, `GlanceTile({ tile })`, `ResearchCompareGraphic({ detail })` — all unchanged signatures in this task.
- Produces: the new `ResearchGlance` DOM contract used by Tasks 2-3 tests — wide slot wrapper carries `@2xl:col-span-2`, right stack wrapper carries `@2xl:col-span-1`, JD full-width row carries `@2xl:col-span-3`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/features/applications/stage-glance-panel.test.tsx`:

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageGlancePanel } from '@/features/applications/components/StageGlancePanel'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const atsCheck = {
  machineReadable: true,
  standardSectionsDetected: ['Experience', 'Skills'],
  contactDetected: { name: 'Test User', email: 'test@example.com' },
  parseBreakers: [],
  jdKeywordCoverage: [
    { term: 'react', present: true, grounded: true },
    { term: 'kubernetes', present: false, grounded: false },
  ],
  status: 'passed',
  passed: true,
  issues: [],
}

const jdExtraction = {
  requiredSkills: ['React', 'TypeScript'],
  preferredSkills: ['Kubernetes'],
  tools: ['Vite'],
  concepts: ['SSR'],
  responsibilities: ['Build UI'],
  domain: 'web',
  seniority: 'senior',
  retrievalKeywords: ['react'],
}

const research = {
  fitRating: 'STRONG_FIT',
  verifiedMatches: [{ skill: 'React' }, { skill: 'TypeScript' }],
  partialMatches: [{ skill: 'Kubernetes' }],
  gaps: [],
}

function makeDetail(overrides: Record<string, unknown> = {}): ApplicationDetail {
  return {
    slug: 'acme-swe',
    targetCompany: 'Acme',
    targetRole: 'SWE',
    status: 'analysing',
    interviewStage: 'applied',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-02T10:00:00.000Z',
    stages: {},
    research,
    analysis: { atsCheck, jdExtraction },
    dsaRealWork: [],
    devopsEvidence: [],
    ...overrides,
  } as unknown as ApplicationDetail
}

describe('StageGlancePanel — applied stage split row', () => {
  it('places the ATS panel in the wide slot and the assessment stack on the right', () => {
    const { container } = render(<StageGlancePanel detail={makeDetail()} stage="applied" />)

    const wide = container.querySelector('[class*="col-span-2"]')
    expect(wide).not.toBeNull()
    expect(wide?.textContent).toContain('ATS check')

    const slim = container.querySelector('[class*="col-span-1"]')
    expect(slim).not.toBeNull()
    expect(slim?.textContent).toContain('Assessment')
    expect(slim?.textContent).toContain('Skill coverage')

    // Wide slot precedes the slim stack in DOM order (ATS left, stack right).
    expect(
      wide && slim ? wide.compareDocumentPosition(slim) & Node.DOCUMENT_POSITION_FOLLOWING : 0,
    ).toBeTruthy()

    // JD understanding sits in its own full-width row below the split.
    const jdRow = screen
      .getByText('What we understood from the JD')
      .closest('[class*="col-span-3"]')
    expect(jdRow).not.toBeNull()
  })

  it('keeps the JD panel in the wide slot when there is no ATS check', () => {
    const detail = makeDetail({ analysis: { atsCheck: null, jdExtraction } })
    const { container } = render(<StageGlancePanel detail={detail} stage="applied" />)

    expect(screen.queryByText('ATS check')).toBeNull()
    const wide = container.querySelector('[class*="col-span-2"]')
    expect(wide).not.toBeNull()
    expect(wide?.textContent).toContain('What we understood from the JD')
    // No duplicate JD row below.
    expect(container.querySelectorAll('[class*="col-span-3"]').length).toBe(0)
  })
})
```

Note: `StageGlancePanel` for the applied stage renders no router links or query hooks, so no providers are needed. If a render error about a missing provider appears, wrap the render in `QueryClientProvider` exactly as `src/__tests__/features/applications/workspaces/technical.test.tsx` does.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/__tests__/features/applications/stage-glance-panel.test.tsx`
Expected: the **first test FAILS** against the current layout on two assertions — the DOM-order check (today the slim `col-span-1` column renders *before* the wide `col-span-2` column, so `slim` does not follow `wide`) and the JD full-width-row check (today the JD panel sits inside the `col-span-2` wrapper, and with `dimensionMix` absent no `col-span-3` element exists at all). The **second test PASSES already** — it locks in today's no-ATS fallback behaviour as a regression guard; that is expected. Confirm exactly this fail/pass split before proceeding.

- [ ] **Step 3: Rewrite `ResearchGlance` with the swapped layout**

In `src/features/applications/components/StageGlancePanel.tsx`, replace the whole `ResearchGlance` function (currently lines 676-718) with:

```tsx
/**
 * Research glance — the default/Applied stage. Wide left slot: the ATS check of
 * the tailored resume (the densest, most actionable block); until ATS data
 * exists the JD panel keeps the wide slot so the row stays balanced. Slim right
 * slot: the Assessment fit tile stacked above the skill-coverage donut, the
 * donut stretching so the stack matches the wide slot's height.
 */
function ResearchGlance({ detail, stage }: StageGlancePanelProps) {
  const fit = stageGlanceTiles(stage, detail).find(tile => tile.key === 'fit')
  const jd = detail.analysis?.jdExtraction ?? null
  const mix = detail.research?.dimensionMix ?? null
  const atsCheck = detail.analysis?.atsCheck ?? null
  // Free tier ships a deterministic evidence-fit score in place of the LLM
  // matcher's verified/partial/gap donut. Show it when present and the matcher
  // produced no verdicts (the free path), otherwise keep the skill-coverage donut.
  const evidenceFit = detail.analysis?.evidenceFit ?? null
  const matcherVerdicts =
    (detail.research?.verifiedMatches?.length ?? 0) +
    (detail.research?.partialMatches?.length ?? 0) +
    (detail.research?.gaps?.length ?? 0)
  const showFreeFit = Boolean(evidenceFit) && matcherVerdicts === 0

  let wideSlot: ReactNode = null
  if (atsCheck) wideSlot = <AtsPanel ats={atsCheck} />
  else if (jd) wideSlot = <JdUnderstandingPanel jd={jd} />

  // @container so the columns respond to the panel's own width (the dashboard has
  // a sidebar), not the viewport — cards go side by side as soon as there is room
  // and stack when narrow.
  return (
    <div className="@container">
      <motion.div key={stage} className="grid gap-4 @2xl:grid-cols-3" variants={GRID} initial="hidden" animate="show">
        {wideSlot && (
          <motion.div variants={TILE} style={{ willChange: 'transform' }} className="flex flex-col @2xl:col-span-2">
            {wideSlot}
          </motion.div>
        )}

        {/* Slim right stack: Assessment above Skill coverage; the coverage card
            takes the remaining height so the stack matches the wide slot. */}
        <motion.div variants={TILE} style={{ willChange: 'transform' }} className="flex flex-col gap-4 @2xl:col-span-1">
          {fit && <GlanceTile tile={fit} />}
          <div className="min-h-0 flex-1">
            {showFreeFit && evidenceFit ? <FitScorePanel fit={evidenceFit} /> : <ResearchCompareGraphic detail={detail} />}
          </div>
        </motion.div>

        {/* Full width: JD understanding drops below only once the ATS check owns the wide slot. */}
        {atsCheck && jd && (
          <motion.div variants={TILE} style={{ willChange: 'transform' }} className="@2xl:col-span-3">
            <JdUnderstandingPanel jd={jd} />
          </motion.div>
        )}

        {/* Full width: role emphasis (JD dimension weighting) */}
        {mix && (
          <motion.div variants={TILE} style={{ willChange: 'transform' }} className="@2xl:col-span-3">
            <RoleEmphasisPanel mix={mix} />
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
```

`ReactNode` is already imported at the top of the file (`import { useEffect, type ReactNode } from 'react'`).

- [ ] **Step 4: Make the ATS card fill the stretched wide slot**

In `src/features/applications/stages/components/AtsPanel.tsx` line 64, add `h-full` so the card fills the grid-stretched wrapper (otherwise a shorter ATS card leaves a gap below itself when the right stack is taller):

```tsx
    <section className={`h-full space-y-4 ${SURFACE}`}>
```

This is the one deliberate touch outside `StageGlancePanel.tsx` — position/stretch only, no content change (the spec's "AtsPanel internals unchanged" refers to its content blocks).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test src/__tests__/features/applications/stage-glance-panel.test.tsx`
Expected: PASS (2 tests)

Also run the guard for other stages: `yarn test src/__tests__/features/applications/workspaces/technical.test.tsx`
Expected: PASS

- [ ] **Step 6: Typecheck, lint, full test run**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: typecheck clean; lint 0 errors (132 pre-existing warnings acceptable); all tests pass (703 = 701 existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add src/features/applications/components/StageGlancePanel.tsx src/features/applications/stages/components/AtsPanel.tsx src/__tests__/features/applications/stage-glance-panel.test.tsx
git commit -m "feat(applications): swap ATS into wide glance slot" -m "- Mirrored the Applied-stage glance row: the ATS check (tailored
resume) now leads the wide left slot with Assessment and Skill
coverage stacked right at matched height, and the JD panel drops
to a full-width row — keeping the densest, most actionable block
dominant. Falls back to the JD panel in the wide slot until ATS
data exists.
- Added the first render tests for StageGlancePanel's applied stage
(slot placement, DOM order, no-ATS fallback)."
```

---

### Task 2: Compact variant for the Assessment tile

**Files:**

- Modify: `src/features/applications/components/StageGlancePanel.tsx` — `SURFACE` const (lines 18-20), `LevelMeter` (lines 39-71), `TileBody` (lines 122-161), `GlanceTile` (lines 163-180), and the `ResearchGlance` call site from Task 1
- Test: `src/__tests__/features/applications/stage-glance-panel.test.tsx` (extend)

**Interfaces:**

- Consumes: Task 1's `ResearchGlance` right-stack markup (`{fit && <GlanceTile tile={fit} />}`).
- Produces: `GlanceTile({ tile, compact? })` — `compact?: boolean`, default `false`; `SURFACE_BASE` const (surface classes without padding) reused by Task 3. All existing `GlanceTile` call sites (other stages) pass no `compact` and render unchanged.

- [ ] **Step 1: Write the failing test**

Append to the `describe` block in `src/__tests__/features/applications/stage-glance-panel.test.tsx`:

```tsx
  it('renders the assessment tile compact in the right stack', () => {
    const { container } = render(<StageGlancePanel detail={makeDetail()} stage="applied" />)
    // Compact level meter: reduced minimum height.
    expect(container.querySelector('[class*="col-span-1"] .min-h-10')).not.toBeNull()
    // Compact card padding.
    expect(container.querySelector('[class*="col-span-1"] .p-4')).not.toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/__tests__/features/applications/stage-glance-panel.test.tsx`
Expected: FAIL — `.min-h-10` matches nothing (meter is `min-h-16`, padding is `p-5`).

- [ ] **Step 3: Implement the compact tile**

In `src/features/applications/components/StageGlancePanel.tsx`:

3a. Split the surface constant (replace lines 18-20):

```tsx
const SURFACE_BASE =
  'rounded-md bg-white ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none'

/** Shared card surface — rounded-md per the project radius convention. */
const SURFACE = `${SURFACE_BASE} p-5`
```

3b. `LevelMeter` — add `compact` (default `false`) and swap the hardcoded `min-h-16`:

```tsx
interface LevelMeterProps {
  readonly level: number
  readonly max: number
  readonly tone: Tone
  readonly reduce: boolean
  readonly compact?: boolean
}

/** A thin equalizer-style meter: `BAR_COUNT` bars whose heights ramp left→right,
 *  filled up to the `level / max` share in the tone colour, each rising from the
 *  baseline on mount. Fills its container in both axes. */
function LevelMeter({ level, max, tone, reduce, compact = false }: LevelMeterProps) {
  const filledCount = Math.round((level / max) * BAR_COUNT)
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => ({
    heightPct: 28 + (i * 72) / (BAR_COUNT - 1),
    filled: i < filledCount,
    delay: i * 0.02,
  }))

  return (
    <div className={`flex h-full items-end gap-0.5 ${compact ? 'min-h-10' : 'min-h-16'}`} aria-hidden>
      {bars.map(bar => (
        <motion.span
          key={bar.heightPct}
          className={`flex-1 rounded-sm ${bar.filled ? TONE_BAR[tone] : 'bg-zinc-200 dark:bg-white/10'}`}
          style={{ height: `${bar.heightPct}%`, transformOrigin: 'bottom', willChange: 'transform' }}
          initial={{ scaleY: reduce ? 1 : 0 }}
          animate={{ scaleY: 1 }}
          transition={{ ...BAR_SPRING, delay: reduce ? 0 : bar.delay }}
        />
      ))}
    </div>
  )
}
```

3c. `TileBody` — accept and apply `compact` (smaller hero/verdict text; if/else, no nested ternaries):

```tsx
/** Body of a tile — one of three shapes: level meter (ordinal), count-up + share
 *  bar (proportional count), or a plain hero value. if/else avoids nested ternaries. */
function TileBody({ tile, reduce, compact }: { readonly tile: GlanceTileData; readonly reduce: boolean; readonly compact: boolean }) {
  const isNumeric = !Number.isNaN(Number(tile.value))
  let valueSize = isNumeric ? 'text-4xl' : 'text-3xl'
  if (compact) valueSize = isNumeric ? 'text-2xl' : 'text-xl'
  const nameBlock = (
    <div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{tile.name}</p>
      {tile.sub && <p className={`mt-0.5 text-[11px] font-medium ${TONE[tile.tone].text}`}>{tile.sub}</p>}
    </div>
  )

  if (tile.meter) {
    return (
      <>
        <div className="flex-1 pt-1">
          <LevelMeter level={tile.meter.level} max={tile.meter.max} tone={tile.tone} reduce={reduce} compact={compact} />
        </div>
        <p className={`${compact ? 'text-base' : 'text-lg'} font-semibold leading-tight ${TONE[tile.tone].text}`}>{tile.value}</p>
      </>
    )
  }

  if (tile.share) {
    return (
      <>
        <CountUpValue value={tile.share.value} className={`${HERO_VALUE} ${valueSize}`} />
        <ShareBar value={tile.share.value} total={tile.share.total} tone={tile.tone} reduce={reduce} />
        {nameBlock}
      </>
    )
  }

  return (
    <>
      <p className={`${HERO_VALUE} ${valueSize}`}>{tile.value}</p>
      {nameBlock}
    </>
  )
}
```

3d. `GlanceTile` — accept `compact`, tighten padding/gap, thread through:

```tsx
/** A single at-a-glance KPI tile — icon + label, then its body (value / meter / share). */
function GlanceTile({ tile, compact = false }: { readonly tile: GlanceTileData; readonly compact?: boolean }) {
  const reduce = useReducedMotion()
  const Icon = tile.icon

  return (
    <div className={`flex h-full flex-col ${SURFACE_BASE} ${compact ? 'gap-2 p-4' : 'gap-3 p-5'}`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-5 ${TONE[tile.tone].dot}`} />
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          {tile.label}
        </span>
      </div>

      <TileBody tile={tile} reduce={Boolean(reduce)} compact={compact} />
    </div>
  )
}
```

3e. In `ResearchGlance` (from Task 1), pass the flag at the call site:

```tsx
          {fit && <GlanceTile tile={fit} compact />}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/__tests__/features/applications/stage-glance-panel.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck, lint, full test run**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all clean/passing. Every other `GlanceTile` call site compiles without changes (prop is optional).

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/components/StageGlancePanel.tsx src/__tests__/features/applications/stage-glance-panel.test.tsx
git commit -m "feat(applications): compact assessment tile" -m "- Added an opt-in compact variant to the glance Assessment tile
(tighter padding, reduced meter height, one-step-smaller verdict
text) so it fits the new slim right stack without changing the
tile's surface, tones, or animations; all other stages render
exactly as before via the default."
```

---

### Task 3: Compact variant for the Skill-coverage donut

**Files:**

- Modify: `src/features/applications/components/StageGlancePanel.tsx` — `ResearchCompareGraphic` (lines 267-350) and its `ResearchGlance` call site
- Test: `src/__tests__/features/applications/stage-glance-panel.test.tsx` (extend)

**Interfaces:**

- Consumes: `SURFACE_BASE` from Task 2; Task 1's right-stack markup.
- Produces: `ResearchCompareGraphic({ detail, compact? })` — `compact?: boolean`, default `false`.

- [ ] **Step 1: Write the failing test**

Append to the `describe` block:

```tsx
  it('renders the skill-coverage donut compact in the right stack', () => {
    const { container } = render(<StageGlancePanel detail={makeDetail()} stage="applied" />)
    const donut = container.querySelector('svg[aria-label="Skill coverage breakdown"]')
    expect(donut).not.toBeNull()
    expect(donut?.getAttribute('class') ?? '').toContain('max-w-28')
    const legend = container.querySelector('[class*="col-span-1"] ul')
    expect(legend?.className ?? '').toContain('space-y-1.5')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/__tests__/features/applications/stage-glance-panel.test.tsx`
Expected: FAIL — donut class contains `max-w-44`, legend is `space-y-3`.

- [ ] **Step 3: Implement the compact donut**

Replace `ResearchCompareGraphic` with (only the sizing hooks change; donut geometry constants, arcs, count-up centre label, and tones stay identical — the SVG scales down automatically because the `viewBox` is constant):

```tsx
/**
 * Skill-coverage donut correlating Verified / Partial / Gaps as shares of the
 * total assessed skills, with a counted, percentaged legend. `compact` shrinks
 * the donut and tightens the legend for the slim right stack of the Applied
 * glance row — same surface, tones, and animations at a smaller scale.
 */
function ResearchCompareGraphic({ detail, compact = false }: { readonly detail: ApplicationDetail; readonly compact?: boolean }) {
  const reduce = useReducedMotion()
  const research = detail.research
  const rows: CompareRow[] = [
    { key: 'verified', name: 'Verified matches', count: research?.verifiedMatches?.length ?? 0, dot: 'bg-emerald-500 dark:bg-emerald-400', stroke: 'stroke-emerald-500 dark:stroke-emerald-400' },
    { key: 'partial', name: 'Partial matches', count: research?.partialMatches?.length ?? 0, dot: 'bg-amber-500 dark:bg-amber-400', stroke: 'stroke-amber-500 dark:stroke-amber-400' },
    { key: 'gaps', name: 'Skills gaps', count: research?.gaps?.length ?? 0, dot: 'bg-red-500 dark:bg-red-400', stroke: 'stroke-red-500 dark:stroke-red-400' },
  ]
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const arcs = buildArcs(rows, total)

  return (
    <div className={`flex h-full flex-col ${SURFACE_BASE} ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center gap-2">
        <PieChart className="size-5 text-accent" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Skill coverage
        </span>
      </div>

      <div className={`flex flex-1 flex-col items-center justify-center ${compact ? 'mt-3 gap-3' : 'mt-4 gap-6'}`}>
        <svg
          viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
          className={`aspect-square w-full shrink-0 ${compact ? 'max-w-28' : 'max-w-44'}`}
          role="img"
          aria-label="Skill coverage breakdown"
        >
          <circle
            cx={DONUT_MID}
            cy={DONUT_MID}
            r={DONUT_R}
            fill="none"
            strokeWidth={DONUT_STROKE}
            className="stroke-zinc-100 dark:stroke-white/10"
          />
          {arcs.map(arc => (
            <ArcSegment
              key={arc.key}
              len={arc.len}
              offset={arc.offset}
              stroke={arc.stroke}
              delay={reduce ? 0 : (arc.offset / DONUT_C) * 0.45}
              reduce={Boolean(reduce)}
            />
          ))}
          <text
            x={DONUT_MID}
            y={DONUT_MID - 4}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-zinc-900 font-bold dark:fill-zinc-100"
            style={{ fontSize: 22 }}
          >
            {total}
          </text>
          <text
            x={DONUT_MID}
            y={DONUT_MID + 15}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-zinc-400 uppercase"
            style={{ fontSize: 9, letterSpacing: 0.5 }}
          >
            skills
          </text>
        </svg>

        <ul className={`w-full ${compact ? 'space-y-1.5' : 'space-y-3'}`}>
          {rows.map(row => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
            return (
              <li key={row.key} className={`flex items-center gap-2.5 ${compact ? 'text-xs' : 'text-sm'}`}>
                <span className={`size-2.5 shrink-0 rounded-full ${row.dot}`} aria-hidden />
                <span className="flex-1 truncate text-zinc-600 dark:text-zinc-300">{row.name}</span>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{row.count}</span>
                <span className="w-9 text-right text-xs tabular-nums text-zinc-400">{pct}%</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
```

Then pass the flag at the `ResearchGlance` call site:

```tsx
            {showFreeFit && evidenceFit ? <FitScorePanel fit={evidenceFit} /> : <ResearchCompareGraphic detail={detail} compact />}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/__tests__/features/applications/stage-glance-panel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck, lint, full test run**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all clean/passing.

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/components/StageGlancePanel.tsx src/__tests__/features/applications/stage-glance-panel.test.tsx
git commit -m "feat(applications): compact skill-coverage donut" -m "- Added an opt-in compact variant to the skill-coverage donut
(donut capped at max-w-28, tightened legend rhythm) so the right
stack matches the ATS panel's height without white-space gaps —
identical geometry, tones, and fill animations at reduced scale."
```

---

### Task 4: End-to-end verification (live data + responsiveness)

**Files:**

- No code changes expected; fix-forward only if verification exposes a defect (then re-run the relevant task's steps).

**Interfaces:**

- Consumes: the running dev stack — Vite dev server on `http://localhost:5001` (start with `yarn dev` from the worktree if down) and the admin-api port-forward (`kubectl port-forward svc/admin-api 3002:3002 -n admin-api`, PATH must include `/opt/homebrew/bin` for the AWS credential helper).

- [ ] **Step 1: Confirm the stack is up**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/ && curl -s http://localhost:3002/healthz`
Expected: `200` and `{"status":"ok",...}`. If 5001 is down: `yarn dev` (background). If 3002 is down: restart the port-forward command above.

- [ ] **Step 2: Manual verification on the live application page**

Open `http://localhost:5001/applications/2579abec-f3d2-4a60-b100-a1823fa59161` (sign in via Cognito if prompted) and verify against the spec:

- Wide container (≥ `@2xl`): ATS check · Tailored resume fills the left two-thirds; Assessment sits above Skill coverage on the right third; the stack's combined height visually matches the ATS panel (no gap below the donut card).
- The Assessment meter, verdict text, donut, and legend render noticeably smaller than on `main`, with identical colours/typography hierarchy.
- JD understanding renders full-width directly below the split row; Role emphasis below it.
- Narrow the browser window (or the dashboard container) below the breakpoint: cards stack single-column in order ATS → Assessment → Skill coverage → JD → Role emphasis; no horizontal scrollbar at any width down to ~320px content width; keyword/section chips wrap.
- Toggle dark mode: all surfaces/tones correct in both themes.
- Enable reduced motion (OS setting or devtools emulation): no count-up/arc/meter animations, content renders at final state.

- [ ] **Step 3: Full gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: typecheck clean; lint 0 errors; full suite passes.

- [ ] **Step 4: Report**

No commit in this task. Report verification results (including screenshots/observations for the responsive and dark-mode checks) back to the user before any merge/PR discussion.

---

## Self-Review Notes

- Spec coverage: split row + swap (Task 1), equal-height stack (Task 1 wrapper + Task 3 `flex-1` consumer), compact Assessment (Task 2), compact donut (Task 3), JD relocation + no-ATS fallback (Task 1), free-tier `FitScorePanel` slot preserved (Task 1 code), other stages untouched (optional props + technical test guard), responsiveness requirement (Task 1 `@container` markup + Task 4 manual checks), testing section (Tasks 1-3 tests + Task 4 manual + full gate).
- The only file touched outside `StageGlancePanel.tsx` is the one-class `h-full` addition in `AtsPanel.tsx`, documented in Task 1 Step 4 with rationale.
- Type consistency: `compact?: boolean` optional with `= false` default on `GlanceTile`, `LevelMeter`, `ResearchCompareGraphic`; `TileBody` takes it required (internal, always passed by `GlanceTile`).
