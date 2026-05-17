# Onboarding: queue repos, deferred bulk sync, then Review

**Date:** 2026-05-17
**Status:** Approved (design)

## Problem

In onboarding, clicking **Add** in the repo picker immediately connects
*and* dispatches the sync job per repo (`triggerGitHubIngestionFn` →
`POST /github/connected-repos`). The intended flow:

- **Add** = queue a repo (max 3 during onboarding), **no sync yet**.
- Proceeding from the repo step triggers the **bulk sync** for all queued
  repos on a **full-screen processing page** (Document-style; can take up
  to ~15 min in production).
- After sync, the **Review / generated page** loads (the `ReviewStep`
  already migrated out of Step 3).

The step graph is already `repos → processing → review`, so this is a
behavioural + visual change, not a new step.

## Decisions (from brainstorming)

1. **Server-side queue** via a new admin-api contract (implemented
   separately in the admin-api repo). This repo implements the BFF +
   onboarding flow + dev-mock simulation.
2. Processing page = **Document aesthetic** (Typewriter heading +
   circular gradient ring for aggregate progress) **+ per-repo
   `SyncProgressBar` list**.
3. Long sync: poll timeout **~15 min**; advance to Review when **every**
   repo is terminal (`complete` OR `error`); partial failures proceed and
   are surfaced non-blocking in Review.
4. Selection step: picker (+Add disabled at 3) + **removable "queued"
   chips**; the `Connected Repositories` / `SyncProgressBar` panel is
   **removed** from this step (moves to the processing page).
5. `GitHubRepoPicker` is shared with Settings — Settings must keep its
   current **immediate-sync** behaviour (prop-driven, not global).

## Contract (admin-api — implemented separately in that repo)

1. `POST /github/connected-repos` body
   `{ repoFullName, defaultBranch, deferSync: true }` → connect repo,
   `syncStatus: 'pending'`, **no** K8s job dispatched.
2. `POST /github/connected-repos/sync` (no body) → dispatch ingestion
   jobs for **all** the caller's `pending` repos; returns
   `{ started: number }`.
3. `DELETE /github/connected-repos/:repoFullName` — unchanged (de-queue).
4. `GET /github/connected-repos` — unchanged (poll;
   `pending → syncing → complete|error`).

Without `deferSync` the existing endpoint keeps its current
connect-and-sync behaviour (Settings, re-sync).

## BFF (`src/server/github.ts`, this repo)

- `queueConnectedRepoFn` → `POST /github/connected-repos` with
  `{ repoFullName, defaultBranch, deferSync: true }`.
- `startConnectedReposSyncFn` → `POST /github/connected-repos/sync`,
  returns `{ started: number }`.
- Keep `triggerGitHubIngestionFn` (Settings re-sync / immediate add),
  `removeConnectedRepoFn`, `getGitHubConnectedReposFn`.

## Components & flow

### `GitHubRepoPicker` (shared)

- Add prop `mode?: 'sync' | 'queue'` (default `'sync'`). Settings keeps
  default (immediate `triggerGitHubIngestionFn`). Onboarding passes
  `mode="queue"` → `handleAdd` calls `queueConnectedRepoFn`.
- `atCap` / `maxRepos = 3` enforced against the count of repos with
  `syncStatus === 'pending'` in queue mode.

### `ConnectReposStep` (selection step)

- Remove `<GitHubConnectedRepos>` from this step.
- Render `<GitHubRepoPicker mode="queue" …>`.
- Below the picker: **queued chips** = `connectedRepos.filter(r =>
  r.syncStatus === 'pending')`, each removable (X →
  `removeConnectedRepoFn`, then invalidate `connectedRepos`).
- Primary button label **"Start indexing"**, enabled when ≥1 pending;
  `onClick` = `onNext` (advance to the `processing` step). The GitHub
  connect step is unchanged (connect → repos).

### `ProcessingStep` (redesigned, full-screen)

- On mount (once): call `startConnectedReposSyncFn()`. On failure: toast +
  a Retry button; do not auto-advance.
- Visual: `Typewriter` heading ("Indexing your repositories"), the
  circular gradient ring (reuse the resume Document aesthetic) showing
  **aggregate** progress = `terminalCount / total`, and a per-repo list
  where each repo shows `SyncProgressBar` (`syncing`/`pending`), the
  synced badge (`complete`), or the error badge (`error`).
- Poll via `useGitHubConnectedRepos`; when **every** repo is terminal
  (`complete` or `error`) call `onNext` → `review`.

### `useGitHubConnectedRepos`

- `POLL_TIMEOUT_MS` → `15 * 60 * 1000`. Existing timeout →
  `markReposTimedOutFn` → repos become `error` → all terminal →
  ProcessingStep advances.

### `ReviewStep`

- Unchanged. Already the terminal step after `processing`.

## dev-mock (`src/server/_dev-mock.ts`)

- `MockConnected` gains `syncStartedAt: number | null` (null = queued).
- `POST /github/connected-repos`:
  - body `deferSync === true` → push repo with `syncStartedAt: null`
    (status `pending`); return `{ status: 'queued', repoFullName, … }`.
  - else (Settings immediate) → push with `syncStartedAt: Date.now()`
    (existing behaviour).
- `POST /github/connected-repos/sync` → set `syncStartedAt = Date.now()`
  for every queued (`syncStartedAt === null`) repo; return
  `{ started: <count> }`.
- `GET /github/connected-repos` → per repo:
  `syncStartedAt === null` → `pending`;
  `now - syncStartedAt < SYNC_MS` → `syncing`;
  else → `complete`.
- `DELETE` unchanged.
- `_api-client` already forwards method + body.

## Error handling

- `startConnectedReposSyncFn` failure → toast + Retry on ProcessingStep,
  no auto-advance.
- Empty queue → ConnectReposStep "Start indexing" disabled.
- 15-min timeout → repos `error` → ProcessingStep advances; ReviewStep
  renders available data and surfaces failed repos non-blocking.

## Testing

- Extend `src/__tests__/server/devMock-github.test.ts`: `deferSync` →
  `pending`; `POST /sync` → `syncing`; reaches terminal; DELETE de-queues.
- Component RTL tests for ProcessingStep / picker omitted — no precedent
  for motion + TanStack server-fn component tests in this repo; a faithful
  test would be heavy/over-engineered (consistent with prior tasks).
  Verification = mock test + `yarn test/lint/typecheck` gate + manual
  walkthrough under `just dev-mock`.
- `useOnboardingState` unaffected.

## Out of scope

- admin-api endpoint implementation (separate repo / spec).
- Settings page behaviour (stays immediate-sync via the default
  `mode='sync'`).
- Visual redesign of ReviewStep, ConnectStep, or the resume Document
  screen beyond reusing the ring/Typewriter aesthetic in ProcessingStep.
