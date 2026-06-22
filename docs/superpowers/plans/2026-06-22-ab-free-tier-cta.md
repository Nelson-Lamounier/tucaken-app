# Free/Paid Tier A/B CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A test-user-gated A/B CTA on the Resume Builder — two buttons ("Generate — Free tier" / "Generate — Paid tier") that dispatch `MODE='free'` vs `'standard'`, enforced server-side.

**Architecture:** admin-api holds an env allowlist (`AB_FREE_TIER_EMAILS`) behind two pure helpers; the `me` endpoint surfaces `abFreeTier`; the strategist-job route resolves the dispatched mode (downgrading non-allowlisted free → standard). The frontend plumbs `mode` through the trigger and renders a small presentational `TierActions` component (one or two buttons) driven by `me.abFreeTier`.

**Tech Stack:** TanStack Start (React 19), TanStack Query/Form, Zod; admin-api Hono + jest; frontend vitest + @testing-library/react.

## Global Constraints

- **Server-side enforcement is authoritative.** The frontend `abFreeTier` check is convenience only; the admin-api MUST re-check on dispatch.
- **Fail-safe:** a non-allowlisted or spoofed `mode:'free'` → silently run `'standard'` + `console.warn`. Never 4xx, never throw.
- **Zero change for normal users:** when `abFreeTier` is false/undefined, the Resume Builder renders today's single "Start Analysis" button and sends no `mode`.
- **No new analytics surface** — the variant rides the existing per-run `metadata.mode` (YAGNI).
- **No migration.** Allowlist is an env var; `metadata.mode` already exists.
- English (UK) in prose/comments. No "Co-Authored-By: Claude" trailer. Commit bodies as impact bullets.
- **Branch:** `feat/ab-free-tier-cta` (off `main`).
- Frontend tests: `yarn test` (vitest). admin-api tests: `cd admin-api && yarn test` (jest).

---

## File Structure

- **Create** `admin-api/src/lib/ab-free-tier.ts` — `isFreeTierAllowed(email)` + `resolveDispatchMode(requestedMode, email)`.
- **Create** `admin-api/src/lib/ab-free-tier.test.ts` — jest unit tests.
- **Modify** `admin-api/src/routes/me.ts` — add `abFreeTier` to the response.
- **Modify** `admin-api/src/routes/pipelines.ts` — use `resolveDispatchMode` for the strategist-job `mode`.
- **Modify** `src/server/me.ts` — add `abFreeTier: boolean` to `MeResponse`.
- **Modify** `src/lib/types/applications.types.ts` — add `mode?: 'free' | 'standard'` to `AnalyseTriggerBody`.
- **Modify** `src/server/pipelines.ts` — `analyseTriggerSchema.mode` + include `mode` in the dispatch body.
- **Create** `src/features/applications/components/TierActions.tsx` — presentational one/two-button CTA.
- **Create** `src/features/applications/components/TierActions.test.tsx` — vitest component test.
- **Modify** `src/features/applications/components/NewAnalysisPanel.tsx` — read `me.abFreeTier`, render `TierActions`, pass `mode` into `trigger.mutate`.

---

## Task 1: admin-api — `isFreeTierAllowed` + `resolveDispatchMode` helpers

**Files:**
- Create: `admin-api/src/lib/ab-free-tier.ts`
- Test: `admin-api/src/lib/ab-free-tier.test.ts`

**Interfaces:**
- Produces:
  - `isFreeTierAllowed(email: string | null | undefined): boolean`
  - `resolveDispatchMode(requestedMode: string, email: string | null | undefined): { mode: 'free' | 'standard'; downgraded: boolean }`

- [ ] **Step 1: Write the failing test**

```typescript
/** @format */
import { isFreeTierAllowed, resolveDispatchMode } from './ab-free-tier.js';

describe('isFreeTierAllowed', () => {
    const ORIG = process.env.AB_FREE_TIER_EMAILS;
    afterEach(() => { process.env.AB_FREE_TIER_EMAILS = ORIG; });

    it('allows an allowlisted email (case-insensitive, trimmed)', () => {
        process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com, other@x.com';
        expect(isFreeTierAllowed('LAMOUNIER_88@hotmail.com')).toBe(true);
        expect(isFreeTierAllowed('  other@x.com ')).toBe(true);
    });
    it('denies a non-listed email, null, and empty/absent env', () => {
        process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com';
        expect(isFreeTierAllowed('someone@else.com')).toBe(false);
        expect(isFreeTierAllowed(null)).toBe(false);
        process.env.AB_FREE_TIER_EMAILS = '';
        expect(isFreeTierAllowed('lamounier_88@hotmail.com')).toBe(false);
    });
});

describe('resolveDispatchMode', () => {
    const ORIG = process.env.AB_FREE_TIER_EMAILS;
    beforeEach(() => { process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com'; });
    afterEach(() => { process.env.AB_FREE_TIER_EMAILS = ORIG; });

    it('keeps free for an allowlisted user', () => {
        expect(resolveDispatchMode('free', 'lamounier_88@hotmail.com')).toEqual({ mode: 'free', downgraded: false });
    });
    it('downgrades free → standard for a non-allowlisted user', () => {
        expect(resolveDispatchMode('free', 'someone@else.com')).toEqual({ mode: 'standard', downgraded: true });
    });
    it('passes standard through unchanged regardless of allowlist', () => {
        expect(resolveDispatchMode('standard', 'someone@else.com')).toEqual({ mode: 'standard', downgraded: false });
        expect(resolveDispatchMode('', 'lamounier_88@hotmail.com')).toEqual({ mode: 'standard', downgraded: false });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd admin-api && yarn test src/lib/ab-free-tier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
/**
 * @format
 * A/B free-tier allowlist. The list of emails permitted to dispatch the
 * MODE='free' resume pipeline lives in the AB_FREE_TIER_EMAILS env var
 * (comma-separated). Pure + env-driven so the gate has a single definition
 * shared by the `me` endpoint (UI visibility) and the dispatch route
 * (authoritative enforcement).
 */
function allowlist(): Set<string> {
    return new Set(
        (process.env.AB_FREE_TIER_EMAILS ?? '')
            .split(',')
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.length > 0),
    );
}

export function isFreeTierAllowed(email: string | null | undefined): boolean {
    if (!email) return false;
    return allowlist().has(email.trim().toLowerCase());
}

/**
 * Resolve the mode to actually dispatch. Free is permitted ONLY for an
 * allowlisted email; any other free request is downgraded to standard
 * (fail-safe — never reject). Standard always passes through.
 */
export function resolveDispatchMode(
    requestedMode: string,
    email: string | null | undefined,
): { mode: 'free' | 'standard'; downgraded: boolean } {
    if (requestedMode === 'free') {
        return isFreeTierAllowed(email)
            ? { mode: 'free', downgraded: false }
            : { mode: 'standard', downgraded: true };
    }
    return { mode: 'standard', downgraded: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd admin-api && yarn test src/lib/ab-free-tier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/ab-free-tier.ts admin-api/src/lib/ab-free-tier.test.ts
git commit -m "feat(applications): AB free-tier allowlist helpers (isFreeTierAllowed + resolveDispatchMode)

Env-driven (AB_FREE_TIER_EMAILS) gate shared by the me endpoint and the dispatch
route; resolveDispatchMode downgrades non-allowlisted free → standard (fail-safe)."
```

---

## Task 2: admin-api — wire `abFreeTier` into `me` + enforce in dispatch

**Files:**
- Modify: `admin-api/src/routes/me.ts` (the `ctx.json({...})` response)
- Modify: `admin-api/src/routes/pipelines.ts` (strategist-job `mode` line)

**Interfaces:**
- Consumes: `isFreeTierAllowed`, `resolveDispatchMode` (Task 1).
- Produces: `me` response includes `abFreeTier: boolean`; the dispatched `MODE` env reflects `resolveDispatchMode`.

- [ ] **Step 1: Add `abFreeTier` to the `me` response**

In `admin-api/src/routes/me.ts`, import `isFreeTierAllowed` from `../lib/ab-free-tier.js` and add to the returned object (alongside `email`):

```typescript
abFreeTier: isFreeTierAllowed(payload['email'] as string | undefined),
```

- [ ] **Step 2: Enforce the dispatched mode in strategist-job**

In `admin-api/src/routes/pipelines.ts`, import `resolveDispatchMode` from `../lib/ab-free-tier.js`. Replace:

```typescript
    const mode = body.mode?.trim() || 'standard';
```
with:

```typescript
    const requestedMode = body.mode?.trim() || 'standard';
    const email = ctx.get('jwtPayload')?.['email'] as string | undefined;
    const { mode, downgraded } = resolveDispatchMode(requestedMode, email);
    if (downgraded) {
        console.warn('[pipelines/strategist-job] free-tier dispatch downgraded — not allowlisted', { userId });
    }
```

(`mode` keeps its name, so the existing `{ name: 'MODE', value: mode }` line is unchanged.)

- [ ] **Step 3: Typecheck + existing tests**

Run: `cd admin-api && yarn test src/lib/ab-free-tier.test.ts && yarn build`
(`yarn build` runs `tsc` — confirm the route edits typecheck. If `ctx.get('jwtPayload')` typing requires a cast, mirror how `me.ts` reads `payload`.)
Expected: PASS / 0 type errors.

- [ ] **Step 4: Commit**

```bash
git add admin-api/src/routes/me.ts admin-api/src/routes/pipelines.ts
git commit -m "feat(applications): surface me.abFreeTier + enforce free-tier dispatch server-side

me returns abFreeTier from the allowlist; strategist-job resolves the dispatched
MODE via resolveDispatchMode, downgrading a non-allowlisted free request to
standard and logging it. Standard dispatch unchanged."
```

---

## Task 3: frontend — `mode` + `abFreeTier` plumbing

**Files:**
- Modify: `src/server/me.ts` (`MeResponse`)
- Modify: `src/lib/types/applications.types.ts` (`AnalyseTriggerBody`)
- Modify: `src/server/pipelines.ts` (`analyseTriggerSchema` + dispatch body)

**Interfaces:**
- Produces: `MeResponse.abFreeTier: boolean`; `AnalyseTriggerBody.mode?: 'free' | 'standard'`; the dispatch forwards `mode`.

- [ ] **Step 1: Add `abFreeTier` to `MeResponse`**

In `src/server/me.ts`, add to the `MeResponse` interface (after `isNew`):

```typescript
  /** A/B harness: true when this user may pick the free-tier resume pipeline. */
  abFreeTier: boolean
```

- [ ] **Step 2: Add `mode` to `AnalyseTriggerBody`**

In `src/lib/types/applications.types.ts`, add to `AnalyseTriggerBody` (after `includeCoverLetter`):

```typescript
  /** A/B harness: 'free' or 'standard' pipeline variant. Omitted → 'standard'. */
  readonly mode?: 'free' | 'standard'
```

- [ ] **Step 3: Add `mode` to the schema + forward it in the dispatch body**

In `src/server/pipelines.ts`, add to `analyseTriggerSchema` (after the `interviewStage` enum field, before its close):

```typescript
  mode: z.enum(['free', 'standard']).optional(),
```

and in `triggerApplicationsAnalysisFn`'s body object, after the `resumeId` spread line, add:

```typescript
          ...(data.mode ? { mode: data.mode } : {}),
```

- [ ] **Step 4: Typecheck**

Run: `yarn build` (or `yarn typecheck` if present) — confirm 0 type errors.
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/me.ts src/lib/types/applications.types.ts src/server/pipelines.ts
git commit -m "feat(applications): plumb mode + me.abFreeTier through the trigger types/schema

AnalyseTriggerBody.mode ('free'|'standard') flows through analyseTriggerSchema
into the strategist-job dispatch body; MeResponse gains abFreeTier."
```

---

## Task 4: frontend — `TierActions` component + wire into `NewAnalysisPanel`

**Files:**
- Create: `src/features/applications/components/TierActions.tsx`
- Test: `src/features/applications/components/TierActions.test.tsx`
- Modify: `src/features/applications/components/NewAnalysisPanel.tsx`

**Interfaces:**
- Consumes: `me.abFreeTier` (Task 3); `trigger.mutate` body now accepts `mode` (Task 3).
- Produces: `TierActions` — a presentational one/two-button submit control.

- [ ] **Step 1: Write the failing `TierActions` test**

```tsx
/** @format */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TierActions } from './TierActions';

describe('TierActions', () => {
    it('shows a single Start Analysis button when abFreeTier is false', () => {
        const onSubmit = vi.fn();
        render(<TierActions abFreeTier={false} isValid={true} isPending={false} onSubmit={onSubmit} />);
        expect(screen.getByRole('button', { name: /start analysis/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /free tier/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /start analysis/i }));
        expect(onSubmit).toHaveBeenCalledWith(undefined);
    });

    it('shows two tier buttons when abFreeTier is true and dispatches the right mode', () => {
        const onSubmit = vi.fn();
        render(<TierActions abFreeTier={true} isValid={true} isPending={false} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole('button', { name: /free tier/i }));
        expect(onSubmit).toHaveBeenCalledWith('free');
        fireEvent.click(screen.getByRole('button', { name: /paid tier/i }));
        expect(onSubmit).toHaveBeenCalledWith('standard');
    });

    it('disables actions when invalid or pending', () => {
        const onSubmit = vi.fn();
        render(<TierActions abFreeTier={true} isValid={false} isPending={false} onSubmit={onSubmit} />);
        for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/features/applications/components/TierActions.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TierActions`**

```tsx
/** @format */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button'; // match the Button import path used in NewAnalysisPanel.tsx

export interface TierActionsProps {
    /** When true, show the two-variant A/B buttons; otherwise the single default button. */
    readonly abFreeTier: boolean;
    readonly isValid: boolean;
    readonly isPending: boolean;
    /** Called with the chosen mode; `undefined` for the default (non-A/B) button. */
    readonly onSubmit: (mode: 'free' | 'standard' | undefined) => void;
}

export function TierActions({ abFreeTier, isValid, isPending, onSubmit }: TierActionsProps) {
    const disabled = !isValid || isPending;
    if (!abFreeTier) {
        return (
            <Button variant="primary" type="button" disabled={disabled} className="gap-2" onClick={() => onSubmit(undefined)}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPending ? 'Analysing…' : 'Start Analysis'}
            </Button>
        );
    }
    return (
        <div className="flex gap-3">
            <Button variant="ghost" type="button" disabled={disabled} className="gap-2" onClick={() => onSubmit('free')}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate — Free tier
            </Button>
            <Button variant="primary" type="button" disabled={disabled} className="gap-2" onClick={() => onSubmit('standard')}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate — Paid tier
            </Button>
        </div>
    );
}
```

(Confirm the real `Button` import path + the `lucide-react` `Loader2` import by matching `NewAnalysisPanel.tsx`'s existing imports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/features/applications/components/TierActions.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Wire `TierActions` into `NewAnalysisPanel`**

In `NewAnalysisPanel.tsx`:
1. Import the me query + the component:
```typescript
import { useQuery } from '@tanstack/react-query';
import { adminKeys } from '@/lib/api/query-keys';
import { getMeFn } from '@/server/me';
import { TierActions } from './TierActions';
```
2. Inside the component, read eligibility:
```typescript
const { data: me } = useQuery({ queryKey: adminKeys.me.detail(), queryFn: getMeFn });
const abFreeTier = me?.abFreeTier ?? false;
```
3. Capture the chosen mode for the submit handler with a ref (avoids form-state churn):
```typescript
const pendingMode = useRef<'free' | 'standard' | undefined>(undefined);
```
4. In the existing `onSubmit` handler, pass the mode into `trigger.mutate`'s body — add to the mutate payload object (after `includeCoverLetter`):
```typescript
          ...(pendingMode.current ? { mode: pendingMode.current } : {}),
```
5. Replace the `<form.Subscribe>` "Actions" submit `<Button …>Start Analysis</Button>` (the primary button only — keep the "Clear" ghost button) with:
```tsx
<TierActions
    abFreeTier={abFreeTier}
    isValid={isValid}
    isPending={trigger.isPending}
    onSubmit={(mode) => { pendingMode.current = mode; form.handleSubmit(); }}
/>
```
(Keep the surrounding `<div className="mt-5 flex items-center justify-between">` + the "✓ Ready to analyse" hint + the Clear button. `form.handleSubmit()` runs the existing validation/onSubmit; the ref carries the variant.)

- [ ] **Step 6: Typecheck + the component test + full vitest**

Run: `yarn build && yarn test src/features/applications/components/TierActions.test.tsx`
Expected: 0 type errors; tests pass. (A non-eligible user renders the single button exactly as before — no visual change.)

- [ ] **Step 7: Commit**

```bash
git add src/features/applications/components/TierActions.tsx src/features/applications/components/TierActions.test.tsx src/features/applications/components/NewAnalysisPanel.tsx
git commit -m "feat(applications): free/paid A/B tier CTA on the Resume Builder (test-user gated)

When me.abFreeTier, the Resume Builder shows two submit buttons (Generate — Free
tier / Paid tier) that dispatch mode='free'/'standard'; normal users see today's
single Start Analysis button unchanged. Mode is carried into trigger.mutate."
```

---

## Self-Review

**1. Spec coverage:**
- `AB_FREE_TIER_EMAILS` allowlist + `isFreeTierAllowed` → Task 1. ✓
- `me.abFreeTier` → Tasks 2 (admin-api) + 3 (frontend type). ✓
- Server-side enforcement w/ silent downgrade + log → Task 2 (`resolveDispatchMode`). ✓
- `mode` plumbing (type → schema → dispatch body → MODE env) → Tasks 3 (frontend) + 2 (admin-api passes `mode`). ✓
- Two-button CTA gated on `abFreeTier`; normal users unchanged → Task 4. ✓
- Variant via existing `metadata.mode` (no new surface) → no task needed (already recorded by ai-applications). ✓
- `testMode` mock untouched → Task 4 only replaces the primary submit button. ✓

**2. Placeholder scan:** The "confirm the real `Button`/`Loader2` import path" and "if `ctx.get('jwtPayload')` typing needs a cast" notes are explicit verification instructions against existing code, not unwritten logic; surrounding code is complete. No TBD/TODO.

**3. Type consistency:** `isFreeTierAllowed`, `resolveDispatchMode` (`{mode, downgraded}`), `abFreeTier`, `mode: 'free'|'standard'`, `TierActions`/`TierActionsProps`, `onSubmit(mode)` are consistent across tasks. The frontend `mode` enum matches the admin-api `requestedMode` values ('free'/'standard').
