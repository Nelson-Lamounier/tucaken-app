# Design — Per-viewer interview-stage launch gating

Date: 2026-06-25
Branch: `worktree-feat+applications-stage-launch-gating` (from `origin/main`)
Status: Approved

## Goal

At launch, only the **Applied** interview stage is functional. The other six
stages on the application detail view (`/applications/$slug`) — Phone Screen,
Technical, System Design, Behavioural, Bar Raiser, Final — are visible but
disabled, each showing a "Soon" badge and a "Coming soon" tooltip. Access is
resolved **per viewer**: a global default (Applied only) plus allow/deny rules
keyed on role, email/id, and subscription tier, so specific users or tiers can
be enabled (or disabled) without a global change.

## Locked decisions

| Decision | Choice |
|---|---|
| Future-stage treatment | Visible but disabled (all 7 tabs stay shown) |
| Coming-soon cue | Persistent "Soon" badge under the label + hover/focus tooltip |
| Control mechanism | Code constants (Sets) + a pure resolver |
| Conflict precedence | **Deny wins**: deny → allow → global default |
| Launch allow-list | Admins (`role`) + a seeded email/id allow-list (empty initially) |
| Deny semantics | A matched viewer is locked to the global default (Applied only); no granular per-stage deny |

## Current state (verified in code)

- The 7-tab strip is `StageProgressBar`
  (`src/features/applications/stages/components/StageProgressBar.tsx`). It maps
  `STAGE_ORDER` to clickable `<button role="tab">` nodes; each calls
  `onSelect(stage)`.
- `STAGE_ORDER` + helpers live in
  `src/features/applications/stages/types/stage.ts`.
- `ApplicationDetailContainer`
  (`src/features/applications/components/ApplicationDetailContainer.tsx`) renders
  `StageProgressBar`, computes `resolvedStage = activeStage ?? detail.interviewStage`,
  wires `handleStageSelect` → `navigate({ search: { stage } })`, and already
  receives a `viewerEmail` prop.
- The detail route `src/app/_dashboard/applications/$slug.tsx` reads `me` via
  `Route.useRouteContext()` (the `_dashboard` layout `beforeLoad` returns
  `{ me, isAdmin }`).
- `MeResponse` (`src/server/me.ts`) provides `id`, `email`, and
  `plan.role` (`'user' | 'admin'`) + `plan.effectivePlan` (`'pro' | 'trial' | 'free'`).

## Architecture

### 1. Access config + resolver — new `stages/types/stage-access.ts`

A single policy module, separate from `stage.ts` to keep that file focused.

```ts
import type { InterviewStage } from '@/lib/types/applications.types'
import { STAGE_ORDER } from './stage'

export interface StageViewer {
  readonly id: string
  readonly email: string
  readonly role: string                 // 'user' | 'admin'
  readonly tier: 'pro' | 'trial' | 'free'
}

/** Everyone not matched by an allow rule gets this. 'applied' MUST always be present. */
export const DEFAULT_ENABLED_STAGES = new Set<InterviewStage>(['applied'])

interface AccessRules {
  readonly roles: ReadonlySet<string>
  readonly emails: ReadonlySet<string>
  readonly ids: ReadonlySet<string>
  readonly tiers: ReadonlySet<string>
}

// Match ANY field → ALL stages enabled. Launch: admins + seeded emails/ids.
const ALLOW: AccessRules = {
  roles: new Set(['admin']),
  emails: new Set<string>([]),
  ids: new Set<string>([]),
  tiers: new Set<string>([]),           // add 'pro' here to tie to the paid tier later
}

// Match ANY field → locked to DEFAULT. Deny wins over allow. Empty at launch.
const DENY: AccessRules = {
  roles: new Set<string>([]),
  emails: new Set<string>([]),
  ids: new Set<string>([]),
  tiers: new Set<string>([]),
}

function matchesAny(rules: AccessRules, viewer: StageViewer): boolean {
  return rules.roles.has(viewer.role)
    || rules.emails.has(viewer.email)
    || rules.ids.has(viewer.id)
    || rules.tiers.has(viewer.tier)
}

/** Resolve which stages this viewer may open. Deny → allow → default. */
export function enabledStagesFor(viewer: StageViewer | null): ReadonlySet<InterviewStage> {
  if (!viewer) return DEFAULT_ENABLED_STAGES
  if (matchesAny(DENY, viewer)) return DEFAULT_ENABLED_STAGES
  if (matchesAny(ALLOW, viewer)) return new Set(STAGE_ORDER)
  return DEFAULT_ENABLED_STAGES
}

export function isStageEnabledFor(
  stage: InterviewStage,
  viewer: StageViewer | null,
): boolean {
  return enabledStagesFor(viewer).has(stage)
}
```

- **Enable later / per tier:** add to `ALLOW.tiers` (e.g. `'pro'`), `ALLOW.emails`,
  `ALLOW.ids`, or `ALLOW.roles`.
- **Disable a user/tier:** add to the matching `DENY.*` set → that viewer is locked
  to `DEFAULT_ENABLED_STAGES`.

### 2. `StageProgressBar` — render disabled stages

New prop: `enabledStages: ReadonlySet<InterviewStage>`.

For a stage where `!enabledStages.has(stage)`:
- `<button disabled aria-disabled="true">` so `onSelect` cannot fire.
- Greyed styling — reuse the existing muted/`notApplicable` colour classes; no new
  palette tokens.
- A persistent **"Soon"** badge rendered under the stage label.
- Tooltip text "Coming soon — available after launch". Use the repo's existing
  tooltip primitive if one is present; otherwise a `title` attribute (accessible,
  zero new dependency). Confirm during implementation.
- The dot keeps its current/upcoming rendering. The enabled `applied` tab is
  unchanged.

### 3. Active-stage clamp — `ApplicationDetailContainer` + route

- `src/app/_dashboard/applications/$slug.tsx`: build a `StageViewer` from `me`
  (`{ id: me.id, email: me.email, role: me.plan.role, tier: me.plan.effectivePlan }`)
  and pass it (or the resolved `enabledStages` set) to `ApplicationDetailContainer`.
- Container: compute `enabledStages = enabledStagesFor(viewer)` once; pass to
  `StageProgressBar`.
- **Clamp:** after computing `resolvedStage = activeStage ?? detail.interviewStage`,
  if `!enabledStages.has(resolvedStage)` set it to `'applied'`. This blocks a manual
  `?stage=technical` URL from opening a disabled workspace; the body below always
  renders the Applied workspace for non-allowed viewers.
- `handleStageSelect` ignores a disabled stage defensively (the button is already
  `disabled`).

## Out of scope (unchanged)

- The mini progress dots in the list rows (`StageProgressTrack`) — display-only,
  not navigation.
- The status / "Advance" control — separate from these tabs.

## Security

This is a **presentation gate**, the same class as the existing publish email-gate.
The stage workspaces are client-side prep UI, so no server-side authority is added.
If a gated stage ever exposes paid data from a server boundary, the gate must also
be enforced in admin-api — explicitly out of scope here.

## Error handling

- `viewer === null` (me unavailable) → `DEFAULT_ENABLED_STAGES` (Applied only).
- A stage value not in `STAGE_ORDER` → treated as not enabled; clamp sends the
  active stage to `'applied'`.
- `DEFAULT_ENABLED_STAGES` must always contain `'applied'`; the clamp target is a
  literal `'applied'`.

## Testing

- `enabledStagesFor` / `isStageEnabledFor` table:
  - admin role → full set
  - allow-listed email or id → full set
  - allow-listed tier (after adding one) → full set
  - deny-listed viewer who is also admin → Applied only (deny wins)
  - plain user → Applied only
  - `null` viewer → Applied only
- `StageProgressBar`: disabled stages render `disabled` + a "Soon" badge; enabled
  stages render clickable; `onSelect` fires only for enabled stages.
- Clamp: `activeStage = 'technical'` with a default viewer resolves to `'applied'`.

## Files

- Create: `src/features/applications/stages/types/stage-access.ts`
- Modify: `src/features/applications/stages/components/StageProgressBar.tsx`
- Modify: `src/features/applications/components/ApplicationDetailContainer.tsx`
- Modify: `src/app/_dashboard/applications/$slug.tsx`
- Tests: `stage-access` unit test, `StageProgressBar` render test, clamp test.
