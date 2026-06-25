# Interview-Stage Launch Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the 7 interview-stage tabs on the application detail view so only "Applied" is active at launch; the other six are visible-but-disabled with a "Soon" badge + tooltip, resolved per viewer (admin/email/id/tier allow + deny lists, deny wins).

**Architecture:** A pure policy module (`stage-access.ts`) resolves the enabled-stage Set for a viewer. `StageProgressBar` renders non-enabled stages as disabled buttons with a "Soon" badge + `title` tooltip. `ApplicationDetailContainer` computes the enabled set from a `StageViewer` (built from `me` in the route) and clamps the active stage to `'applied'` when the requested stage is not enabled, blocking `?stage=` URL bypass.

**Tech Stack:** React 19, TanStack Router, Vitest + @testing-library/react (happy-dom), Tailwind v4, lucide-react.

## Global Constraints

- Yarn 4 only. Tests: `yarn test <path>`. Types: `yarn typecheck`. Lint: `yarn lint`. All green before "done".
- `Set` + `.has()` for membership/allow-lists (SonarQube S7776). No nested ternaries (S3358). No `console.*`. No `as any`. Optional chaining over `&&`. Stable React keys.
- English (UK); term is "resume" (not relevant here but applies to any copy). User-facing copy uses product voice, never "agent".
- Corner radius default `rounded-md`. Tooltip = native `title` attribute (repo convention; e.g. `StackMap.tsx` uses `title=`). No new dependency.
- RTL test files need the `/** @vitest-environment happy-dom */` pragma (repo convention).
- Commits: follow `git-commit` style; **no `Co-Authored-By` trailer**.
- Presentation gate only — do not add server-side authority. Out of scope: list-row `StageProgressTrack` dots and the status/"Advance" control.
- `'applied'` must always be in `DEFAULT_ENABLED_STAGES`; the clamp target is the literal `'applied'`.

## File structure

- Create `src/features/applications/stages/types/stage-access.ts` — `StageViewer`, `DEFAULT_ENABLED_STAGES`, `ALLOW`/`DENY` rules, `enabledStagesFor`, `isStageEnabledFor`.
- Modify `src/features/applications/stages/components/StageProgressBar.tsx` — new `enabledStages` prop; disabled rendering + "Soon" badge + tooltip.
- Modify `src/features/applications/components/ApplicationDetailContainer.tsx` — accept `viewer`, compute `enabledStages`, clamp `resolvedStage`, pass `enabledStages` to `StageProgressBar`.
- Modify `src/app/_dashboard/applications/$slug.tsx` — build `StageViewer` from `me`, pass `viewer` prop.

---

### Task 1: stage-access policy module + resolver

**Files:**
- Create: `src/features/applications/stages/types/stage-access.ts`
- Test: `src/__tests__/features/applications/stage-access.test.ts`

**Interfaces:**
- Consumes: `InterviewStage` from `@/lib/types/applications.types`; `STAGE_ORDER` from `./stage`.
- Produces: `StageViewer { id: string; email: string; role: string; tier: 'pro'|'trial'|'free' }`; `DEFAULT_ENABLED_STAGES: ReadonlySet<InterviewStage>`; `enabledStagesFor(viewer: StageViewer | null): ReadonlySet<InterviewStage>`; `isStageEnabledFor(stage, viewer): boolean`. Consumed by Tasks 2 (type) and 3.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/applications/stage-access.test.ts
import { describe, it, expect } from 'vitest'
import {
  enabledStagesFor,
  isStageEnabledFor,
  type StageViewer,
} from '@/features/applications/stages/types/stage-access'
import { STAGE_ORDER } from '@/features/applications/stages/types/stage'

const user = (over: Partial<StageViewer> = {}): StageViewer => ({
  id: 'u1', email: 'u1@example.com', role: 'user', tier: 'free', ...over,
})

describe('enabledStagesFor', () => {
  it('null viewer → applied only', () => {
    const s = enabledStagesFor(null)
    expect([...s]).toEqual(['applied'])
  })
  it('plain user → applied only', () => {
    expect([...enabledStagesFor(user())]).toEqual(['applied'])
  })
  it('admin role → all stages', () => {
    expect(enabledStagesFor(user({ role: 'admin' })).size).toBe(STAGE_ORDER.length)
  })
  it('deny wins over allow (admin on deny-list → applied only)', () => {
    // Relies on the deny test-seed below; see Step 3 note.
    expect([...enabledStagesFor(user({ role: 'admin', email: 'blocked@example.com' }))]).toEqual(['applied'])
  })
})

describe('isStageEnabledFor', () => {
  it('applied always enabled, technical gated for plain user', () => {
    expect(isStageEnabledFor('applied', user())).toBe(true)
    expect(isStageEnabledFor('technical', user())).toBe(false)
  })
  it('technical enabled for admin', () => {
    expect(isStageEnabledFor('technical', user({ role: 'admin' }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/stage-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// src/features/applications/stages/types/stage-access.ts
import type { InterviewStage } from '@/lib/types/applications.types'
import { STAGE_ORDER } from './stage'

/** The viewer dimensions gating is resolved against (built from `me`). */
export interface StageViewer {
  readonly id: string
  readonly email: string
  readonly role: string                 // 'user' | 'admin'
  readonly tier: 'pro' | 'trial' | 'free'
}

/** Default for every viewer not matched by an allow rule. Must contain 'applied'. */
export const DEFAULT_ENABLED_STAGES: ReadonlySet<InterviewStage> = new Set(['applied'])

interface AccessRules {
  readonly roles: ReadonlySet<string>
  readonly emails: ReadonlySet<string>
  readonly ids: ReadonlySet<string>
  readonly tiers: ReadonlySet<string>
}

/** Match ANY field → ALL stages enabled. Launch: admins + seeded emails/ids. */
const ALLOW: AccessRules = {
  roles: new Set(['admin']),
  emails: new Set<string>([]),          // add tester/design-partner emails here
  ids: new Set<string>([]),             // add specific user ids here
  tiers: new Set<string>([]),           // add 'pro' to tie the feature to the paid tier later
}

/** Match ANY field → locked to DEFAULT. Deny wins over allow. Empty at launch. */
const DENY: AccessRules = {
  roles: new Set<string>([]),
  emails: new Set<string>(['blocked@example.com']),  // seed so the deny-wins test is meaningful; real deny entries added as needed
  ids: new Set<string>([]),
  tiers: new Set<string>([]),
}

function matchesAny(rules: AccessRules, viewer: StageViewer): boolean {
  return rules.roles.has(viewer.role)
    || rules.emails.has(viewer.email)
    || rules.ids.has(viewer.id)
    || rules.tiers.has(viewer.tier)
}

/** Resolve which stages this viewer may open. Order: deny → allow → default. */
export function enabledStagesFor(viewer: StageViewer | null): ReadonlySet<InterviewStage> {
  if (!viewer) return DEFAULT_ENABLED_STAGES
  if (matchesAny(DENY, viewer)) return DEFAULT_ENABLED_STAGES
  if (matchesAny(ALLOW, viewer)) return new Set(STAGE_ORDER)
  return DEFAULT_ENABLED_STAGES
}

export function isStageEnabledFor(stage: InterviewStage, viewer: StageViewer | null): boolean {
  return enabledStagesFor(viewer).has(stage)
}
```

Note on the `DENY` seed: `'blocked@example.com'` is a real placeholder entry purely so the "deny wins" test asserts behaviour. It is harmless in production (no such user). If you prefer a clean DENY, instead make the deny-wins test inject its own rules — but the module does not expose the rule sets, so the seed is the simplest honest test. Keep the seed.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/applications/stage-access.test.ts && yarn typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/stages/types/stage-access.ts src/__tests__/features/applications/stage-access.test.ts
git commit -m "feat(applications): per-viewer interview-stage access resolver"
```

---

### Task 2: StageProgressBar — disabled stage rendering

**Files:**
- Modify: `src/features/applications/stages/components/StageProgressBar.tsx`
- Test: `src/__tests__/features/applications/StageProgressBar.test.tsx`

**Interfaces:**
- Consumes: `InterviewStage`, `StageState`; `STAGE_ORDER`, `STAGE_LABELS`.
- Produces: `StageProgressBar` gains required prop `enabledStages: ReadonlySet<InterviewStage>`. Disabled stages render `<button disabled>` with a "Soon" badge + `title` tooltip; `onSelect` fires only for enabled stages. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/applications/StageProgressBar.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageProgressBar } from '@/features/applications/stages/components/StageProgressBar'

describe('StageProgressBar gating', () => {
  const enabled = new Set(['applied'] as const)

  it('renders the Applied tab enabled and Technical disabled with a Soon badge', () => {
    render(<StageProgressBar current="applied" active="applied" onSelect={() => {}} enabledStages={enabled} />)
    const applied = screen.getByRole('tab', { name: /^Applied$/ })
    expect(applied).not.toBeDisabled()
    const technical = screen.getByRole('tab', { name: /Technical/ })
    expect(technical).toBeDisabled()
    // "Soon" badge present somewhere on the strip
    expect(screen.getAllByText('Soon').length).toBeGreaterThan(0)
  })

  it('does not fire onSelect for a disabled stage but does for an enabled one', () => {
    const onSelect = vi.fn()
    render(<StageProgressBar current="applied" active="applied" onSelect={onSelect} enabledStages={enabled} />)
    screen.getByRole('tab', { name: /Technical/ }).click()
    expect(onSelect).not.toHaveBeenCalled()
    screen.getByRole('tab', { name: /^Applied$/ }).click()
    expect(onSelect).toHaveBeenCalledWith('applied')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/StageProgressBar.test.tsx`
Expected: FAIL — `enabledStages` prop not present; disabled stages not rendered as disabled.

- [ ] **Step 3: Add the prop + disabled rendering**

Edit `StageProgressBar.tsx`:

(a) Add `enabledStages` to the props interface:

```tsx
interface StageProgressBarProps {
  /** The application's real interview stage (Current Stage). */
  readonly current: InterviewStage
  /** The stage the user is viewing (Active Stage). */
  readonly active: InterviewStage
  readonly onSelect: (stage: InterviewStage) => void
  /** Stages this viewer may open. Stages not in the set render disabled with a "Soon" cue. */
  readonly enabledStages: ReadonlySet<InterviewStage>
  /** Per-stage lifecycle state from the backend (see resolveSegment). */
  readonly stages?: Record<string, StageState>
}
```

(b) Destructure it and compute per-stage:

```tsx
export function StageProgressBar({ current, active, onSelect, enabledStages, stages }: StageProgressBarProps) {
  const activeIndex = STAGE_ORDER.indexOf(active)

  return (
    <div role="tablist" aria-label="Interview stages" className="flex items-start overflow-x-auto">
      {STAGE_ORDER.map((stage, idx) => {
        const { completed, isCurrent, notApplicable, queued } = resolveSegment(stage, current, stages)
        const isActive = stage === active
        const isEnabled = enabledStages.has(stage)

        return (
          <Fragment key={stage}>
            {idx > 0 && (
              <span
                aria-hidden
                className={`mt-2 h-0.5 min-w-8 flex-1 rounded-full transition-colors ${connectorClass(idx, activeIndex)}`}
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={nodeAriaLabel(stage, notApplicable, queued)}
              disabled={!isEnabled}
              title={isEnabled ? undefined : 'Coming soon — available after launch'}
              onClick={() => { if (isEnabled) onSelect(stage) }}
              className={`group relative flex shrink-0 flex-col items-center gap-2 whitespace-nowrap rounded-md px-2 pb-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 ${nodeTextClass(notApplicable, isActive)} ${isEnabled ? '' : 'cursor-not-allowed opacity-60'}`}
            >
              <span
                className={
                  isActive && !notApplicable
                    ? 'rounded-full ring-2 ring-offset-0 ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]'
                    : undefined
                }
              >
                <StageDot completed={completed} current={isCurrent} notApplicable={notApplicable} />
              </span>
              <span className="flex items-center gap-1.5">
                {STAGE_LABELS[stage]}
                {queued && (
                  <span
                    aria-label="Generating prep"
                    className="inline-flex size-1.5 animate-pulse rounded-full bg-amber-400 dark:bg-amber-300"
                  />
                )}
              </span>
              {!isEnabled && (
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  Soon
                </span>
              )}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
```

(Everything else in the file — `resolveSegment`, `connectorClass`, `nodeTextClass`, `nodeAriaLabel`, `StageDot` — is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/applications/StageProgressBar.test.tsx`
Expected: PASS. (Full typecheck will fail until Task 3 supplies `enabledStages` at the call site — that is expected; do not run full typecheck here.)

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/stages/components/StageProgressBar.tsx src/__tests__/features/applications/StageProgressBar.test.tsx
git commit -m "feat(applications): disabled stage tabs with Soon badge and tooltip"
```

---

### Task 3: Container clamp + route viewer wiring

**Files:**
- Modify: `src/features/applications/components/ApplicationDetailContainer.tsx`
- Modify: `src/app/_dashboard/applications/$slug.tsx`
- Test: `src/__tests__/features/applications/stage-clamp.test.ts`

**Interfaces:**
- Consumes: `enabledStagesFor`, `StageViewer` (Task 1); `StageProgressBar` `enabledStages` prop (Task 2); existing `me` route context (`{ id, email, plan: { role, effectivePlan } }`).
- Produces: container accepts `viewer?: StageViewer | null`; computes `enabledStages`; clamps `resolvedStage`; passes `enabledStages` to `StageProgressBar`. A pure helper `clampStage(requested, enabledStages): InterviewStage` (exported) for testing.

To keep the clamp unit-testable without rendering the whole container, extract a tiny pure helper.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/applications/stage-clamp.test.ts
import { describe, it, expect } from 'vitest'
import { clampStage } from '@/features/applications/components/ApplicationDetailContainer'

describe('clampStage', () => {
  const appliedOnly = new Set(['applied'] as const)
  it('keeps an enabled stage', () => {
    expect(clampStage('applied', appliedOnly)).toBe('applied')
  })
  it('clamps a disabled stage to applied', () => {
    expect(clampStage('technical', appliedOnly)).toBe('applied')
  })
  it('keeps a stage that is enabled in a larger set', () => {
    const all = new Set(['applied', 'technical'] as const)
    expect(clampStage('technical', all)).toBe('technical')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/stage-clamp.test.ts`
Expected: FAIL — `clampStage` not exported.

- [ ] **Step 3: Add the helper + clamp + prop in the container**

In `ApplicationDetailContainer.tsx`:

(a) Add imports near the existing stage imports:

```ts
import { enabledStagesFor, type StageViewer } from '../stages/types/stage-access'
```

(b) Add the exported helper at module top level (above the component):

```ts
/** Reduce a requested stage to one the viewer may open; falls back to 'applied'. */
export function clampStage(
  requested: InterviewStage,
  enabledStages: ReadonlySet<InterviewStage>,
): InterviewStage {
  return enabledStages.has(requested) ? requested : 'applied'
}
```

(c) Add `viewer` to the props interface (keep `viewerEmail` as-is — it still feeds the publish gate):

```ts
interface ApplicationDetailContainerProps {
  readonly slug: string
  readonly activeStage?: InterviewStage
  readonly focus?: string
  /** The authenticated user's email — used to gate privileged actions. */
  readonly viewerEmail?: string
  /** The authenticated viewer — used to gate interview-stage access. */
  readonly viewer?: StageViewer | null
}
```

(d) Destructure `viewer` and use it. Change the signature and the `resolvedStage` line (currently line ~152 and ~262):

```ts
export function ApplicationDetailContainer({ slug, activeStage, focus, viewerEmail, viewer }: ApplicationDetailContainerProps) {
```

```ts
  // Active Stage = explicit ?stage param, else the application's Current Stage —
  // clamped to a stage this viewer may open (blocks ?stage= URL bypass).
  const enabledStages = enabledStagesFor(viewer ?? null)
  const requestedStage: InterviewStage = activeStage ?? detail.interviewStage
  const resolvedStage: InterviewStage = clampStage(requestedStage, enabledStages)
```

(e) Pass `enabledStages` to `StageProgressBar` (currently line ~325):

```tsx
        <StageProgressBar
          current={detail.interviewStage}
          active={resolvedStage}
          onSelect={handleStageSelect}
          enabledStages={enabledStages}
          stages={detail.stages}
        />
```

- [ ] **Step 4: Wire the route to build the viewer**

In `src/app/_dashboard/applications/$slug.tsx`, build a `StageViewer` from `me` and pass it. Replace the component body:

```tsx
function ApplicationDetailRoute() {
  const { slug } = Route.useParams()
  const { stage, focus } = Route.useSearch()
  const { me } = Route.useRouteContext()

  const viewer = me
    ? { id: me.id, email: me.email, role: me.plan.role, tier: me.plan.effectivePlan }
    : null

  return (
    <ApplicationDetailContainer
      slug={slug}
      activeStage={stage}
      focus={focus}
      viewerEmail={me?.email}
      viewer={viewer}
    />
  )
}
```

(`me.plan.effectivePlan` is typed `'pro' | 'trial' | 'free'`, matching `StageViewer.tier` — no cast needed.)

- [ ] **Step 5: Run the clamp test + full gate**

Run: `yarn test src/__tests__/features/applications/stage-clamp.test.ts && yarn typecheck && yarn lint && yarn test src/__tests__/features/applications`
Expected: PASS, 0 type errors, 0 lint errors. (Task 2's `StageProgressBar` now receives `enabledStages` from the container, so the whole app compiles.)

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/components/ApplicationDetailContainer.tsx "src/app/_dashboard/applications/$slug.tsx" src/__tests__/features/applications/stage-clamp.test.ts
git commit -m "feat(applications): clamp active stage to viewer-enabled stages"
```

---

### Task 4: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green (admin-api untouched, so no need to run its suite).

- [ ] **Step 2: Manual check (`yarn dev`, port 5001)**

- Open an application detail as a **non-admin** (or with `me` resolving to a plain user): only **Applied** is clickable; the other six are greyed, show a "Soon" badge, and a "Coming soon — available after launch" tooltip on hover. Applied workspace renders.
- Hand-edit the URL to `?stage=technical`: the view falls back to the Applied workspace (clamp), and the Technical tab stays disabled.
- As an **admin** (`plan.role === 'admin'`): all seven tabs are clickable and the future workspaces open.

- [ ] **Step 3: Finish the branch**

Invoke `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage:**
- §1 access config + resolver (DEFAULT/ALLOW/DENY, deny→allow→default, enable/disable per role/email/id/tier) → Task 1. ✅
- §2 StageProgressBar disabled render (disabled button, muted, "Soon" badge, tooltip, onSelect only when enabled) → Task 2. ✅
- §3 container clamp + route viewer wiring → Task 3. ✅
- §4 out of scope (list-row dots, status control untouched) → not modified by any task. ✅
- §5 presentation-gate only (no server authority) → no admin-api change. ✅
- §6 testing (resolver table, disabled render, clamp) → Tasks 1/2/3 tests + Task 4. ✅

**Placeholder scan:** none — every step has real code. The `DENY` seed (`blocked@example.com`) is intentional and documented, not a placeholder.

**Type consistency:** `StageViewer` shape (Task 1) is built identically in the route (Task 3) from `me.id/email/plan.role/plan.effectivePlan`. `enabledStagesFor` returns `ReadonlySet<InterviewStage>`, consumed as the `enabledStages` prop (Task 2) and by `clampStage` (Task 3) — same type throughout. `clampStage(requested, enabledStages)` signature matches its test.

**Risk to flag at execution:** the `StageProgressBar` test queries tabs by accessible name (`Applied`, `Technical`); `nodeAriaLabel` returns `STAGE_LABELS[stage]` for normal stages, so the names match `STAGE_LABELS` ("Applied", "Technical", …). If a stage is also `notApplicable`/`queued` the aria-label changes — the test uses a default `current="applied"` with no `stages` prop, so segments are plain. Sound.
