# Onboarding & Database Settings Refactor

**Date:** 2026-05-10
**Status:** Approved

## Overview

Three coordinated changes:

1. Extend the onboarding wizard with a dedicated repo-picker step and a processing gate that redirects to the dashboard on completion.
2. Repurpose `/settings/github` as a "Database" management page (tabbed, no forced progression).
3. Rename "Application Analysis" to "Resume Analysis" across the app.

---

## 1. Onboarding Step Changes

### New step sequence

| Index | ID           | Name          | Required | Notes |
|-------|--------------|---------------|----------|-------|
| 0     | `welcome`    | Welcome       | false    | Unchanged |
| 1     | `portfolio`  | Portfolio     | false    | Unchanged |
| 2     | `resume`     | Resume        | false    | Unchanged — `ImportCareerStep` |
| 3     | `connect`    | Connect       | true     | Unchanged — `ConnectStep` (GitHub app install) |
| 4     | `repos`      | Repositories  | true     | New — `ConnectReposStep` with max-3 cap |
| 5     | `processing` | Processing    | true     | New — `ProcessingStep`, auto-advances |

The `done` step is removed. Redirect to `/overview` is handled by `ProcessingStep` on completion.

### `types.ts`

```typescript
export type StepId = 'welcome' | 'portfolio' | 'resume' | 'connect' | 'repos' | 'processing'

export const STEPS: Array<{ id: StepId; name: string; required: boolean }> = [
  { id: 'welcome',    name: 'Welcome',        required: false },
  { id: 'portfolio',  name: 'Portfolio',      required: false },
  { id: 'resume',     name: 'Resume',         required: false },
  { id: 'connect',    name: 'Connect',        required: true  },
  { id: 'repos',      name: 'Repositories',   required: true  },
  { id: 'processing', name: 'Processing',     required: true  },
]
```

`OnboardingData` gains `reposConnected: boolean` (set true when ≥1 repo is added in the repos step).

### `useOnboardingState`

- `next()` guard on `repos` step: disabled if `connectedRepos.length === 0`.
- No `back()` or `skip()` rendered for `processing` step — `OnboardingShell` suppresses `StepFooter` when `stepId === 'processing'`.
- `CONNECT_STEP_INDEX` constant stays at 3; the GitHub install callback already lands there.

---

## 2. New & Modified Step Components

### `ProcessingStep` (new)

**File:** `src/features/onboarding/components/steps/ProcessingStep.tsx`

**Behaviour:**
- Polls `getGitHubConnectedReposFn` every 3 s on mount.
- Terminal condition: all connected repos have `syncStatus === 'complete'` or `'error'`.
- On terminal: `router.navigate({ to: '/overview', replace: true })`.
- UI: single animated progress indicator, copy "Indexing your repositories…", sub-line "This usually takes a minute or two".
- No `StepFooter` rendered (suppressed in `OnboardingShell` for this step).

### `ConnectReposStep` changes

- Button label: "Next: Generate Resume" → **"Next: Start Indexing"**.
- `GitHubRepoPicker` receives a new `maxRepos={3}` prop; the `+ Add` button disables once 3 repos are connected.
- Hint rendered below the picker: "You can connect up to 3 repositories".

---

## 3. Settings "Database" Page

### Route & nav rename

- Nav label: "GitHub" → **"Database"**
- File stays at `_dashboard.settings.github.tsx` (route path `/settings/github` unchanged to avoid redirect churn — display name only changes).
- Page `<title>` and heading: "Database".
- Sub-heading: "Manage the repositories and resumes that seed your knowledge base."

### Layout

Replaces the `OnboardingContainer` wizard with a full-width tabbed layout matching the rest of the settings pages. `OnboardingSidebar` is removed.

**Tabs:**

| Tab | Content |
|-----|---------|
| **Repositories** | `GitHubAccountSection` + `GitHubConnectedRepos` + `GitHubRepoPicker` (all always visible, no step wrapper). Max-3 cap applies here too (`maxRepos={3}` on `GitHubRepoPicker`). |
| **Resumes** | List of uploaded resumes with filename + date metadata. "Add resume" button swaps tab content to `ImportCareerStep` inline. On `saved` or cancel → returns to resume list. |

### On-demand wizard triggers

- **Repositories tab:** If no installation exists, `GitHubAccountSection` shows the connect prompt. Clicking it → GitHub install flow → redirect back → URL params stripped, Repositories tab shown. No `OnboardingProgress` bar. No step navigation.
- **Resumes tab:** "Add resume" replaces tab content with `ImportCareerStep`. Back/cancel → resume list. No `OnboardingProgress` bar.
- `GenerateResumeStep` is **deleted** — file removed, all imports cleaned up.

---

## 4. "Application Analysis" → "Resume Analysis" Rename

Pure text change. No route, component name, or structural changes.

**Touch points:**
- `_dashboard.applications.new.tsx` — page `<title>`, step bar label, any heading copy
- Sidebar / nav item label
- Any breadcrumb referencing "Application Analysis"

---

## Files Changed

### New
- `src/features/onboarding/components/steps/ProcessingStep.tsx`

### Modified
- `src/features/onboarding/components/onboarding/types.ts` — new step IDs + `reposConnected` field
- `src/features/onboarding/components/onboarding/useOnboardingState.ts` — repos guard, processing suppression
- `src/features/onboarding/components/onboarding/OnboardingShell.tsx` — render new steps, suppress footer on processing
- `src/features/onboarding/components/steps/ConnectReposStep.tsx` — button label, `maxRepos` prop, hint copy
- `src/features/github/components/GitHubRepoPicker.tsx` — `maxRepos` prop + disable logic
- `src/app/onboarding.tsx` — update step index max (0–5), remove done-step handling
- `src/app/_dashboard.settings.github.tsx` — replace wizard with tabbed layout
- `src/app/_dashboard.applications.new.tsx` — label rename

### Deleted
- `src/features/onboarding/components/steps/GenerateResumeStep.tsx`

---

## Constraints

- Max 3 repositories per sync — enforced in both onboarding (`repos` step) and settings (Repositories tab).
- `processing` step is a hard gate — no way to skip or go back; user must wait for indexing or close the tab.
- Error repos (`syncStatus === 'error'`) count as terminal — they do not block the redirect to `/overview`.
- `done` step removed entirely; `/overview` redirect is the terminal action.
