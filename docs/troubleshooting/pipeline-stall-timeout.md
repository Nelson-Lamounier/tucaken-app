---
title: Pipeline run shown as failed when it stalled or actually succeeded
type: troubleshooting
tags: [state-machine, polling, error-handling, pipelines, react-query]
sources:
  - src/features/applications/components/ProgressBars.tsx
  - src/hooks/use-admin-applications.ts
  - src/server/pipelines.ts
created: 2026-06-16
updated: 2026-06-16
---

The Strategist pipeline (job-description analysis -> resume build) runs as a K8s
Job and is tracked from the browser by polling. Tucaken renders the run as a
four-stage stepper in `ProgressBars`. This doc covers three related defects in
that surface: a long-but-healthy run being declared "timed out", a timed-out run
that secretly finished still being shown as failed, and the stepper spinner that
kept spinning on a terminal (failed/timed-out) state.

## Symptom

Three observable failure modes, all on the in-flight run modal:

- A successful run that took about 10m46s displayed as "Build timed out", and the
  run finishing roughly 46s later was never picked up (commit f8fac5b).
- A timed-out run (`pipeline_runs` not literally `failed`, application status
  still `analysing`) kept a stage in the spinning `current` state: the UI showed
  "Build timed out" with "Writing your resume" still spinning and a Retry button
  (commit d4f175c).
- The "we'll notify you when it's ready" reassurance and the live elapsed timer
  stayed active even though nothing was running (commit d4f175c).

## Root cause

Two independent causes.

1. Hard wall-clock cap that never reset. The detail-poll timeout was a fixed
   10-minute cap measured from the first active poll, and once it tripped it
   stopped polling forever, so a run finishing shortly after was never seen
   (commit f8fac5b). The constant was `POLL_TIMEOUT_MS = 10 * 60 * 1_000` and the
   poll bails when `elapsed > POLL_TIMEOUT_MS` ([src/hooks/use-admin-applications.ts](../../src/hooks/use-admin-applications.ts#L9-L10), [src/hooks/use-admin-applications.ts](../../src/hooks/use-admin-applications.ts#L143-L150)).

2. Terminal state not modelled in the stepper. `ProgressBars` derived `isFailed`
   and `isFinished` but the stepper, timer, and footer only branched on
   `isFailed` ([src/features/applications/components/ProgressBars.tsx](../../src/features/applications/components/ProgressBars.tsx#L128-L139)). A `timedOut`
   run is neither `isFailed` (status is still `analysing`, not `failed` -
   [src/features/applications/components/ProgressBars.tsx](../../src/features/applications/components/ProgressBars.tsx#L128-L129)) nor `isFinished`, so the
   `getStageStatus` happy path left the active stage in `current` and rendered the
   spinning loader ([src/features/applications/components/ProgressBars.tsx](../../src/features/applications/components/ProgressBars.tsx#L181-L190), [src/features/applications/components/ProgressBars.tsx](../../src/features/applications/components/ProgressBars.tsx#L281-L285)).

## How to diagnose

- Check the application status versus the pipeline-run status. They come from two
  independent polls: the detail hook (`useApplicationDetail`, with its own
  `timedOut`) and the pipeline-run hook (`usePipelineRunStatus`), polled every
  `PIPELINE_POLL_INTERVAL` of 5s ([src/hooks/use-admin-applications.ts](../../src/hooks/use-admin-applications.ts#L9-L9), [src/hooks/use-admin-applications.ts](../../src/hooks/use-admin-applications.ts#L213-L222)).
- Confirm whether the run actually finished. `getPipelineRunStatusFn` returns the
  raw `run.status` from admin-api ([src/server/pipelines.ts](../../src/server/pipelines.ts#L382-L398)). A `complete`
  status here while the UI shows "timed out" is the success-shown-as-failed case.
- Inspect the K8s-Job-killed edge: if the Job was OOM-killed before its catch
  block ran, `kanban_status` stays `analysing` while `pipeline_runs.status` may
  already be `failed` from an earlier DB write - which is why failure is checked
  against both sources ([src/features/applications/components/ProgressBars.tsx](../../src/features/applications/components/ProgressBars.tsx#L126-L129)).
- The active states that keep polling are `analysing` and `coaching`
  ([src/hooks/use-admin-applications.ts](../../src/hooks/use-admin-applications.ts#L12-L15)).

## How to fix

Both fixes are flow-state changes, not infra changes.

- Raise the cap to a stall backstop and reset on progress. Set
  `POLL_TIMEOUT_MS = 20 * 60 * 1_000` (above the slowest successful run, about
  11 min) and reset `pollStartRef` whenever the run advances - tracked by a
  `lastUpdatedRef` that compares `detail.updatedAt` - so a long-but-active run
  never trips the timer (commit f8fac5b). Reset both refs when the run leaves the
  active states (commit f8fac5b).
- Treat pipeline-run completion as finished (recovery). `ProgressBars` makes
  `isFinished` true when `pipelineRun.status === 'complete'`, and the pipeline-run
  poll runs on its own interval (not gated by the detail hook's timeout), so a run
  that completes just after the UI gave up self-heals to "Resume ready" within a
  poll. The stall predicate becomes `isStalled = isFailed || (timedOut && !isFinished)`,
  so a recovered run is never shown as stalled (commit f8fac5b).
- Stop the stepper spinning on a terminal state. Introduce
  `isStalled = isFailed || timedOut` and branch the stepper, the elapsed timer, the
  header timer badge, and the footer on it: a stalled run marks the stage it
  stopped on as `failed` (nothing spins), stops the timer, hides the reassurance
  line, and shows only Retry plus the standardised heading (commit d4f175c).
- Fix the copy. The timed-out subheading no longer claims "No update for
  10 minutes" - it reads that contact was lost and to Retry (commit f8fac5b,
  commit d4f175c).

## How to prevent

- Model terminal states explicitly. Any "in progress" UI driven by polling needs
  a single derived "no longer progressing" predicate (`isStalled`) so the spinner,
  timer, and CTAs cannot disagree about whether work is still happening
  (commit d4f175c).
- Make timeouts stall-based, not wall-clock-based. Reset the timer on observed
  progress (`updatedAt` change) rather than capping total duration, so a slow but
  healthy run is never mistaken for a dead one (commit f8fac5b).
- Keep the recovery poll independent. The pipeline-run poll must not be gated by
  the detail hook's `timedOut`, otherwise a late completion can never be observed
  (commit f8fac5b).
- Lock behaviour with tests. `ProgressBars.failed-state` asserts a timed-out or
  failed run shows Retry and no running stage while an in-progress run still shows
  one (commit d4f175c); `ProgressBars.recovery` asserts a timed-out app with a
  completed pipeline run shows the success state, not Retry (commit f8fac5b).

<!--
Evidence trail (read 2026-06-16):
- src/features/applications/components/ProgressBars.tsx (full, working tree)
- src/hooks/use-admin-applications.ts (full, working tree)
- src/server/pipelines.ts (full, working tree)
- git show f8fac5b (commit + diff: use-admin-applications.ts, ProgressBars.tsx, ProgressBars.recovery.test.tsx)
- git show d4f175c (commit + diff: ProgressBars.tsx, ProgressBars.failed-state.test.tsx)
Note: commits f8fac5b and d4f175c are valid evidence per task rules; at the time
of writing they were not ancestors of the checked-out HEAD, so the working-tree
files may not yet reflect every change described above.
-->
