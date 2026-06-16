---
title: Run the strategist matcher on Sonnet, decoupled from the article pipeline
type: decision
tags: [bedrock, model-selection, strategist, claude-sonnet, cost]
sources:
  - admin-api/src/lib/config.ts
  - admin-api/src/routes/pipelines.ts
created: 2026-06-16
updated: 2026-06-16
---

## Status

Accepted — introduced 2026-06-15 (commit `87d3daa`, PR #125).

## Context

The job-strategist research agent (the "matcher") emits a nuanced multi-section
brief: verified/partial/gap classification, a fit rating, and a `fitSummary`,
all grounded to evidence (commit `87d3daa`). Getting that structured verdict
right depends on the underlying Bedrock model.

The matcher ran on the Bedrock model forwarded as `RESEARCH_MODEL`. That value
was shared by **both** the article pipeline and the strategist matcher: the
single `researchModel` config field was injected as `RESEARCH_MODEL` into both
the article-pipeline Job and the strategist Job
([config.ts](../../admin-api/src/lib/config.ts), [pipelines.ts](../../admin-api/src/routes/pipelines.ts)).
Because one environment variable drove two unrelated pipelines, neither could be
tuned without changing the other (commit `87d3daa`).

On Haiku the matcher's verdict was unstable: across identical re-runs it flipped
between STRONG FIT and REACH, and it ignored the hard years bar — the very
non-determinism the deterministic years-gap guard was built to paper over
(commit `87d3daa`; see the `strategistResearchModel` doc comment in
[config.ts#L236-L247](../../admin-api/src/lib/config.ts)). This is the same
class of task for which the coach and profile-synthesis agents already default
to Sonnet — the coach likewise needed Sonnet because Haiku produced
structurally-invalid output for its strict tool-schema brief
([config.ts#L245-L253](../../admin-api/src/lib/config.ts)).

## Decision

Add a dedicated `strategistResearchModel` config field, sourced from a new
`STRATEGIST_RESEARCH_MODEL` environment variable and defaulting to Sonnet 4.6
(`eu.anthropic.claude-sonnet-4-6`):

```ts
strategistResearchModel: process.env['STRATEGIST_RESEARCH_MODEL'] ?? 'eu.anthropic.claude-sonnet-4-6',
```

The strategist Job now forwards `config.strategistResearchModel` as its
`RESEARCH_MODEL` env var, while the article Job keeps the original
`config.researchModel` (Haiku) — see the changed line in
[pipelines.ts](../../admin-api/src/routes/pipelines.ts):

```ts
{ name: 'RESEARCH_MODEL', value: config.strategistResearchModel },
```

This mirrors the existing `coachModel` default-to-Sonnet pattern in
[config.ts#L245-L253](../../admin-api/src/lib/config.ts) (commit `87d3daa`).
The two model choices are now independent: the matcher runs on Sonnet for a
stable, schema-faithful verdict; the article pipeline stays on Haiku.

## Consequences

- The strategist matcher produces a stable verdict across identical re-runs and
  respects the hard years bar, rather than relying on the deterministic
  years-gap guard to mask Haiku's non-determinism (commit `87d3daa`).
- Sonnet costs more per token than Haiku, so the strategist pipeline is now more
  expensive than before — but only the strategist pipeline. The article pipeline
  is unaffected and keeps Haiku (commit `87d3daa`). This per-pipeline cost
  separation is the point: you tune one without paying for the other.
- Both knobs default sensibly and are overridable per environment via
  `STRATEGIST_RESEARCH_MODEL` and `RESEARCH_MODEL`, so no code change is needed
  to re-tune either pipeline.
- Model jobs run as one-shot Kubernetes Jobs without Job-level retry, so the
  Sonnet cost of a strategist run is incurred at most once per dispatch — see
  [No Job-level retry for model-invoking Kubernetes Jobs](0005-no-retry-on-model-jobs.md).

## Alternatives considered

- **Keep a single shared `RESEARCH_MODEL`.** Rejected: one variable drove both
  the article pipeline and the strategist matcher, so neither could be tuned
  without affecting the other (commit `87d3daa`).
- **Move the whole article pipeline to Sonnet too.** Not done: the change keeps
  the article Job on `researchModel` (Haiku) and only the strategist Job on
  Sonnet, avoiding a blanket cost increase on a pipeline that did not need it
  (commit `87d3daa`).
- **Lean on the deterministic years-gap guard alone.** Rejected: the guard was a
  workaround for Haiku's instability on this task, not a fix — running the
  matcher on Sonnet addresses the root cause (commit `87d3daa`).

<!--
Evidence trail (2026-06-16):
- git show -s --format=… 87d3daa — PR #125 commit body (primary evidence):
  matcher brief shape, Haiku STRONG FIT <-> REACH instability + ignored years
  bar, RESEARCH_MODEL shared by both pipelines, new STRATEGIST_RESEARCH_MODEL
  (default Sonnet 4.6), mirrors coachModel pattern.
- git show --stat 87d3daa — touched config.ts, pipelines.ts (+ their tests).
- git show 87d3daa -- admin-api/src/lib/config.ts admin-api/src/routes/pipelines.ts
  — exact added field strategistResearchModel (default eu.anthropic.claude-sonnet-4-6)
  and the pipelines.ts RESEARCH_MODEL -> config.strategistResearchModel change.
- admin-api/src/lib/config.ts#L245-L253 — coachModel default-to-Sonnet precedent.
- Cross-link: 0005-no-retry-on-model-jobs.md (cost / no Job-level retry).
- Not verified / omitted: exact per-token Sonnet vs Haiku price (no figure in
  evidence); the full matcher prompt and the years-gap guard implementation
  (referenced in commit body, not read for this doc).
-->
