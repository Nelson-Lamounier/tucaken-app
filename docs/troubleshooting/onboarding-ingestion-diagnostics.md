---
title: Onboarding ingestion diagnostics — 0% progress and NULL profile synthesis
type: troubleshooting
tags: [ingestion, kubernetes, bedrock, onboarding, eks, rds]
sources:
  - admin-api/src/lib/ingestion-job.ts
  - admin-api/src/lib/k8s-job-builder.ts
  - src/features/onboarding/components/steps/ProcessingStep.tsx
created: 2026-05-28
updated: 2026-06-16
---

## Part 1 — "Indexing your repositories" stuck at 0%

> **Status — historical case study (largely resolved since 2026-05-28).** Kept for
> its investigation method (live EKS diagnosis + RDS verification), not as current
> guidance. Two defects identified here have since been addressed in this repo:
> Part 2's missing model-env injection is fixed — `ingestionModelEnv` now injects
> all five Bedrock model ids into the ingestion Job
> ([ingestion-job.ts](../../admin-api/src/lib/ingestion-job.ts#L102),
> [k8s-job-builder.ts](../../admin-api/src/lib/k8s-job-builder.ts#L112-L120)); and
> Part 1's onboarding progress now uses intra-repo `progressSum / total`
> ([ProcessingStep.tsx](../../src/features/onboarding/components/steps/ProcessingStep.tsx#L243)),
> not the binary `terminalCount / total` cited below. Embed-loop and synthesizer
> internals referenced here live in the sibling **ai-applications** repo and were
> not re-verified in this pass.

**Date:** 2026-05-28
**Cluster:** `arn:aws:eks:eu-west-1:771826808455:cluster/k8s-eks-development` (dev account)
**Triggering case:** Job `ingestion-a32fdb11-d494-4db3-9ed6-3f9b152c50f7-nelson-b7675306`
(user `a32fdb11-…`, repo `Nelson-Lamounier/cdk-monitoring`)
**Status:** Diagnosed. No data-loss bug — UX gap + a real performance defect that risks false failures. Fixes deferred for a later PR.

---

## 1. Symptom

During onboarding, the **"Indexing your repositories"** step shows the progress ring at **0%** and a per-repo **"syncing"** badge for the entire run (10+ minutes), giving no indication that the pod is actually doing work. It then jumps straight to 100% when the repo finishes.

## 2. Investigation (live cluster)

| Check | Observation |
|---|---|
| Pod | `…b767hcr7l` — `Running`, `1/1`, 0 restarts |
| Job | `…b7675306` — `active: 1`, `activeDeadlineSeconds: 900`, `backoffLimit: 2` |
| Logs | Frozen at `2761 chunks from 319 files` + `85 commit-history chunks` after `profile_extraction.complete` (04:28:10) — no further output for ~10 min |
| Terminal | **Succeeded** 04:40:19 — `Complete / CompletionsReached` |
| Final log | `embedded: 2846, skipped: 0, pruned: 0, kb_quality_score: 0.8`, **`duration_ms: 669442` (11.2 min)** |

The pod was healthy and working the whole time. The "frozen logs" are the **embed + enrich phases, which emit no per-chunk logging.** It finished with only ~3.8 min of headroom before the 900s deadline.

## 3. Root cause

### 3a. UX gap — progress is per-repo-terminal, not per-chunk

The onboarding UI derives progress purely from how many repos have reached a terminal status:

`src/features/onboarding/components/steps/ProcessingStep.tsx:123`
```ts
const pct = total === 0 ? 0 : Math.round((terminalCount / total) * 100)
```
`terminalCount` counts repos whose `syncStatus ∈ {complete, error}`. With a single in-flight repo, `terminalCount = 0` → **0% until the whole repo completes**, then 100%. The "syncing" badge is correct; there is simply no intermediate signal.

This is reinforced by how status is persisted — `sync_status` is **binary**, written only at phase boundaries:
- Dispatch seeds `sync_status = 'pending'` (admin-api).
- Pipeline `markStarted` → `'syncing'` at the start of `ingestChunks`.
- Pipeline `markComplete` → `'complete'` **only at the very end**, after embed + enrich + prune + retrieval-probe:
  `ai-applications/applications/shared/src/rds/pipeline/IngestionPipeline.ts:238`

No incremental progress (e.g. embedded-so-far / total) is ever written to the DB, so even a smarter UI has nothing to poll. The polling layer itself is fine — `src/features/github/hooks/use-github-connected-repos.ts` polls every 5s while any repo is active, with a 15-min timeout.

### 3b. Performance defect — embed loop is strictly sequential

`ai-applications/applications/shared/src/rds/pipeline/IngestionPipeline.ts:169-173`
```ts
for (const { chunk, contentHash } of chunksToEmbed) {
    const enriched  = enrichedByKey.get(`${chunk.filePath}::${chunk.chunkIndex}`) ?? chunk;
    const embedText = this.buildEmbedText(enriched.content, repoFullName, enriched.filePath, enriched.heading);
    const embedding = await this.embedder.embed(embedText);   // ← one Bedrock call at a time
    embeddedChunks.push({ ...enriched, userId, repoFullName, contentHash, embedding });
}
```
Every chunk is embedded with a single awaited Bedrock Titan call, no concurrency. For 2846 chunks at ~150–300 ms round-trip each, that is **~7–14 min of wall-clock embedding alone.**

By contrast, the **enrich** phase already uses a bounded-concurrency worker pool but is throttled to only 5 workers:
- `ENRICHMENT_CONCURRENCY = 5` — `IngestionPipeline.ts:51`
- worker pool — `IngestionPipeline.ts:359-370`

Up to 2000 chunks × Bedrock LLM enrich (~1–2s each) ÷ 5 ≈ **~7–10 min.**

Both phases run **back-to-back** before `markComplete`, which is why a single moderately-large repo (cdk-monitoring: 319 files → 2846 chunks) takes ~11 min.

## 4. Impact / risk

- **No functional data loss** — embeddings persisted, `kb_quality_score: 0.8`.
- **Confusing UX** — 10+ min at "0% / syncing" reads as "stuck/broken."
- **False-failure risk (the real danger):** total runtime came within ~3.8 min of the **900s `activeDeadlineSeconds`**. A larger repo, or Bedrock throttling, will breach the deadline → `DeadlineExceeded` → Job marked **Failed** → UI flips the repo to **error** even though the work was nearly (or fully) done. The read-time reconcile in `admin-api/src/routes/github.ts` (around line 580) explicitly treats deadline-killed jobs as errors.

## 5. Recommended fixes (priority order)

### Fix #1 — Parallelize the embed loop *(highest leverage)*
Replace the sequential `for … await embedder.embed()` at `IngestionPipeline.ts:169-173` with the same bounded worker-pool pattern already used by `enrichChunks` (`IngestionPipeline.ts:359-370`). 5–10 workers pulling from a shared index counter.
- **Effect:** embed wall-clock ~10 min → ~1–2 min.
- **Watch:** Bedrock Titan TPM/RPM quota; preserve output ordering (write into a pre-sized array by index, as enrich does).
- **Files:** `ai-applications/applications/shared/src/rds/pipeline/IngestionPipeline.ts`.

### Fix #2 — Real progress reporting *(addresses the original complaint)*
Persist incremental progress so the UI shows actual movement.
- Pipeline: write `embedded-so-far / total` to `repo_sync_state` (e.g. every N chunks) during the embed/enrich loops, alongside the existing `chunk_count`.
- admin-api: expose the counts on `GET /connected-repos` (extend the `sync_status` payload).
- UI: change `ProcessingStep.tsx:123` to use intra-repo embedded/total when a repo is `syncing`, instead of binary terminal counting.
- **Files:** `IngestionPipeline.ts` (+ `RdsSyncStateRepository`), `admin-api/src/routes/github.ts`, `src/features/onboarding/components/steps/ProcessingStep.tsx`, `src/lib/types/github.types.ts`.

### Fix #3 — Raise enrichment concurrency
`ENRICHMENT_CONCURRENCY` 5 → 10 at `IngestionPipeline.ts:51` (validate against Bedrock quota).

### Fix #4 — Per-chunk progress logging
Log every N embedded/enriched chunks so the pod is not silent for 10 min (also aids ops/Grafana). Pairs naturally with Fix #2.

### Stopgap (no code change)
Raise `activeDeadlineSeconds` above 900, and/or set `ENRICHMENT_DISABLED=1` for very large repos. Mitigates the false-failure risk without fixing the underlying slowness.

## 6. Verification checklist for the eventual fix PR

- [ ] Re-ingest `Nelson-Lamounier/cdk-monitoring` (`forceReindex`); confirm `duration_ms` drops substantially (target < 300s).
- [ ] Confirm embedded chunk count unchanged (2846) and `kb_quality_score` unchanged (~0.8).
- [ ] Confirm chunk ordering / `chunkIndex` integrity preserved after parallel embed.
- [ ] No Bedrock throttling errors in pod logs at the new concurrency.
- [ ] (If Fix #2) UI ring advances incrementally during a single-repo sync, not 0→100.
- [ ] No regression on the deadline/reconcile path in `admin-api/src/routes/github.ts`.

---

### Key references
- UI progress math: `src/features/onboarding/components/steps/ProcessingStep.tsx:123`
- Polling hook: `src/features/github/hooks/use-github-connected-repos.ts`
- Sequential embed loop (defect): `ai-applications/.../rds/pipeline/IngestionPipeline.ts:169-173`
- Enrich worker pool (pattern to copy): `ai-applications/.../rds/pipeline/IngestionPipeline.ts:359-370`
- `markComplete` (terminal write): `ai-applications/.../rds/pipeline/IngestionPipeline.ts:238`
- Job entrypoint / status flow: `ai-applications/applications/ingestion/src/run-ingestion.ts`
- Read-time reconcile / deadline handling: `admin-api/src/routes/github.ts` (~line 580)

---

## Part 2 — Profile synthesis sections stuck "still being generated"

**Date:** 2026-05-28
**Same case:** user `a32fdb11-…`, repo `Nelson-Lamounier/cdk-monitoring`
**Status:** Diagnosed and **DB-verified**. Real defect (missing env-var injection + silent fallback divergence). Production-readiness fix below. Not yet applied.

## 1. Symptom

In onboarding/profile, three sections never populate:
- **"This is you, distilled"** → `Your profile summary is still being generated.`
- **"Where you fit"** → `Your direction is still being generated.`
- **"Résumé vs. reality"** → `Your résumé reconciliation is still being generated.`

Per-project resume bullets ("Your projects, resume-ready") **do** work — e.g. cdk-monitoring renders a correct bullet. So extraction succeeds while the rollup *synthesis* layer is empty.

## 2. DB verification (live RDS, dev account)

Queried `user_profile_rollup` for the user via a one-shot psql pod (`envFrom: platform-rds-credentials`, namespace `ingestion`):

```
user_id                | a32fdb11-d494-4db3-9ed6-3f9b152c50f7
has_rollup             | t     ← deterministic rollup computed
has_mirror             | f     ← NULL
has_reveal             | f     ← NULL
has_direction          | f     ← NULL
has_recon              | f     ← NULL
has_diag               | t     ← deterministic diagnostic score (LLM explanation null)
refreshed_at           | 2026-05-28 04:28:10
synthesis_refreshed_at | 2026-05-28 04:28:10
```

The four **LLM-synthesis** columns are NULL; the two **deterministic** outputs (rollup, diagnostic score) are present. This is the exact signature of synthesizers being disabled, not failing mid-call.

## 3. Root cause

### 3a. Model env var never injected into the Job
The ingestion Job builder sets **only** `ENRICHMENT_MODEL_ID`:
`admin-api/src/routes/github.ts:431-444` (and the second dispatch path `admin-api/src/routes/ingestion.ts:~88`).

Live Job env (verified via `kubectl get job … -o jsonpath`) contained no `PROFILE_EXTRACTOR_MODEL_ID`, `MIRROR_REVEAL_MODEL_ID`, `DIRECTION_MODEL_ID`, `RECONCILIATION_MODEL_ID`, or `DIAGNOSTIC_MODEL_ID`. `envFrom` = `platform-rds-credentials` only.

### 3b. Divergent missing-var behavior (the footgun)
The **same** missing variable behaves two ways:

| Consumer | Reads | Missing-var behavior | Result |
|---|---|---|---|
| ProfileExtractor (bullets) | `env.profileExtractorModelId` | **code default** `claude-haiku-4-5` (`ai-applications/applications/ingestion/src/env.ts:34-35`) | ✅ works |
| MirrorReveal "distilled" | `process.env['MIRROR_REVEAL_MODEL_ID'] ?? process.env['PROFILE_EXTRACTOR_MODEL_ID']` | **no default → `undefined` → `return undefined`** (`agents/MirrorRevealSynthesizer.ts:116-118`) | ❌ skipped |
| Direction "Where you fit" | same pattern (`agents/DirectionSynthesizer.ts:135-138`) | undefined → skipped | ❌ skipped |
| Reconciliation "Résumé vs reality" | same (`agents/ReconciliationSynthesizer.ts:134-137`) | undefined → skipped | ❌ skipped |

`fromEnvironment` returns `undefined` → `refreshUserProfileRollup` skips synthesis (`util/refreshUserProfileRollup.ts:38-53`) → NULL columns written. The extractor's silent default **masked** the gap: bullets succeed, pipeline looks healthy.

### 3c. Failures invisible
`refreshUserProfileRollup` swallows synthesis errors to the OTel span only (`util/refreshUserProfileRollup.ts:82-89`) and the `fromEnvironment` skip is silent — nothing reaches pino/stdout, so `kubectl logs` shows no clue.

### 3d. Reconciliation has a SECOND, independent gate
Even with a model configured, "Résumé vs reality" needs an imported résumé: `getResumeForReconciliation(userId)` → no résumé = skip (`util/refreshUserProfileRollup.ts:48-52`). The user has not imported career history, so this section stays empty until import — *expected*, not the same bug.

## 4. Impact

- Core onboarding payoff (profile narrative + direction) silently missing for any user ingested without the model vars set.
- No functional error surfaced anywhere; only a NULL DB column and a generic "still being generated" string.
- Likely affects every user ingested under the current Job template, not just this one.

## 5. Permanent production-readiness fix

### Part 1 — Typed model config, single source of truth, fail-fast
`admin-api/src/lib/config.ts` (~line 162). Add typed fields and resolve once at boot:
```ts
readonly profileExtractorModelId: string;   // required — THROW at boot if unset (no silent default)
readonly mirrorRevealModelId:     string;    // value ?? profileExtractorModelId
readonly directionModelId:        string;
readonly reconciliationModelId:   string;
readonly diagnosticModelId:       string;
```
Source from Helm values → SSM/ConfigMap, the same path `ENRICHMENT_MODEL_ID` already uses. Fail-fast removes the split-brain where one consumer defaults and another silently disables.

### Part 2 — Inject into BOTH dispatch paths (DRY helper)
Gap exists in `admin-api/src/routes/github.ts:431-444` AND `admin-api/src/routes/ingestion.ts:~88`. Extract one helper, spread into both Job env arrays so they cannot drift:
```ts
function modelEnv(c: AdminApiConfig) {
  return [
    { name: 'PROFILE_EXTRACTOR_MODEL_ID', value: c.profileExtractorModelId },
    { name: 'MIRROR_REVEAL_MODEL_ID',     value: c.mirrorRevealModelId },
    { name: 'DIRECTION_MODEL_ID',         value: c.directionModelId },
    { name: 'RECONCILIATION_MODEL_ID',    value: c.reconciliationModelId },
    { name: 'DIAGNOSTIC_MODEL_ID',        value: c.diagnosticModelId },
  ];
}
```

### Part 3 — Kill the silent-skip footgun (ingestion service)
- `run-ingestion.ts:304-310`: when any `…Synthesizer.fromEnvironment` returns `undefined`, emit a pino `warn` (`synthesizer_disabled`, stage, reason) to stdout.
- `util/refreshUserProfileRollup.ts:38-53,82-89`: replace the silent `catch { … = undefined }` per stage with pino log + a Prometheus counter `synthesis_outcome{stage, outcome=ok|skipped|failed}`. Enables a Grafana alert on "synthesis disabled in prod."

### Part 4 — Backfill affected users
No rollup-only entrypoint exists today (`refreshUserProfileRollup` runs only inside `run-ingestion.ts`). Options:
- **Quick (no new code):** after Parts 1-2 deploy, re-dispatch ingestion with `forceReindex` for the affected user. Heavy — re-embeds (~11 min/repo, see Part 1) — but unblocks synthesis.
- **Production-grade:** add a `run-rollup.js` entrypoint that runs `refreshUserProfileRollup` only (no re-embed) + an admin dispatch route. Cheap, reusable, and powers a future "Regenerate profile" action.

Blast-radius query:
```sql
SELECT count(*) FROM user_profile_rollup WHERE rollup IS NOT NULL AND mirror IS NULL;
```

### Part 5 — Reconciliation UX (separate concern)
Change `src/features/profile/components/ReconciliationPanel.tsx` copy to distinguish *not-yet-possible* from *in-progress*: show "Import your résumé to unlock this" when the user has no career history, instead of "still being generated."

### Tests to gate the fix
- admin-api unit: `buildIngestionJobSpec` (both paths) env includes all 5 model IDs.
- config unit: boot throws when `PROFILE_EXTRACTOR_MODEL_ID` is unset.
- ingestion unit: `fromEnvironment` fallback chain; `refreshUserProfileRollup` logs + increments `synthesis_outcome` on skip/fail.

## 6. Verification after deploy
- [ ] New ingest → re-run the §2 query → `has_mirror = has_reveal = has_direction = t`.
- [ ] `synthesis_outcome{outcome="ok"}` increments; no `skipped`/`failed`.
- [ ] UI: "This is you, distilled" + "Where you fit" render content.
- [ ] Reconciliation: shows résumé-import prompt (no résumé) and populates after a résumé import.

### Key references (Part 2)
- Rollup orchestration + skip gates: `ai-applications/applications/ingestion/src/util/refreshUserProfileRollup.ts:38-53`
- Synthesizer gating: `agents/{MirrorRevealSynthesizer,DirectionSynthesizer,ReconciliationSynthesizer}.ts` (`fromEnvironment`)
- Extractor silent default (the mask): `ai-applications/applications/ingestion/src/env.ts:34-35`
- Job env builders (the gap): `admin-api/src/routes/github.ts:431-444`, `admin-api/src/routes/ingestion.ts:~88`
- Config loader: `admin-api/src/lib/config.ts:162`
- Rollup table read API (UI source): `admin-api/src/routes/profile.ts:40`
- Rollup upsert (COALESCE semantics): `ai-applications/applications/shared/src/rds/implementations/RdsUserProfileRollupRepository.ts:80-107`
- UI panels: `src/features/profile/components/{MirrorPanel,DirectionPanel,ReconciliationPanel}.tsx`
