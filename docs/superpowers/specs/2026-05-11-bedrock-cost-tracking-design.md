# Bedrock Cost Tracking — Design Spec

**Date:** 2026-05-11
**Status:** Approved
**Region:** eu-west-1 (Dublin)

---

## Background

A single user spent ~8 EUR (~$8.64 USD) in one session during resume import and GitHub repo sync. Currently zero visibility into per-user token usage or charges. This spec adds soft-limit cost tracking: capture all Bedrock token usage, surface it in the admin dashboard, and alert when a user approaches their monthly budget ceiling.

---

## 1. Architecture Overview

**Approach:** Extend the existing `prompt_invocations` table (already used by job-strategist and article-pipeline) with two new columns (`import_id`, `repo_name`) to cover resume-import and repo-sync pipelines. Add a `user_token_budgets` table for per-user monthly caps. Wire the four Bedrock call sites that currently discard token usage to insert cost records. Add an admin Cost tab to ReportContainer.

**Not in scope:** Pre-flight hard limits, user-facing cost UI, self-service budget management.

```
Bedrock call site
  → extract token counts from response
  → compute cost_cents
  → INSERT prompt_invocations
  → post-call soft limit check (log warn if over threshold)
```

---

## 2. Data Model

### 2a. Extend `prompt_invocations` (existing table, ai-applications)

```sql
ALTER TABLE prompt_invocations
  ADD COLUMN import_id UUID REFERENCES resume_imports(id) ON DELETE SET NULL,
  ADD COLUMN repo_name TEXT;

CREATE INDEX idx_prompt_invocations_user_month
  ON prompt_invocations (user_id, invoked_at);
```

### 2b. New `user_token_budgets` table

```sql
CREATE TABLE user_token_budgets (
  user_id              UUID PRIMARY KEY,
  monthly_limit_cents  INTEGER  NOT NULL DEFAULT 500,  -- $5.00 default
  alert_threshold_pct  SMALLINT NOT NULL DEFAULT 80,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2c. Pricing constants (backend, USD)

| Constant | Value | Model |
|---|---|---|
| `HAIKU_INPUT_CENTS_PER_1K` | `0.00080` | `eu.anthropic.claude-haiku-4-5-*` |
| `HAIKU_OUTPUT_CENTS_PER_1K` | `0.00400` | `eu.anthropic.claude-haiku-4-5-*` |
| `SONNET_INPUT_CENTS_PER_1K` | `0.00300` | `eu.anthropic.claude-sonnet-4-6` |
| `SONNET_OUTPUT_CENTS_PER_1K` | `0.01500` | `eu.anthropic.claude-sonnet-4-6` |
| `TITAN_INPUT_CENTS_PER_1K` | `0.0000260` | `amazon.titan-embed-text-v2` |

**Pricing notes:**
- Titan Embeddings V2 in eu-west-1: `$0.026004/1M` — confirmed via `aws pricing get-products` (eu-west-1).
- Claude Haiku 4.5 / Sonnet 4.6 in EU: available as cross-region inference profiles (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`, `eu.anthropic.claude-sonnet-4-6`) but AWS Pricing API returns no EU-specific price. US base rates used as conservative floor. EU cross-region inference can carry up to ~20% surcharge — revisit constants once Anthropic publishes EU rates.
- AWS bills in USD. No automatic EUR conversion — display raw USD cents in the dashboard.

---

## 3. Capture Points

Four Bedrock call sites in `ai-applications` currently discard token usage. All four must insert into `prompt_invocations` after each API call.

### 3a. `resume-import-processor/src/bedrock/extract-career.ts`

- Model: Claude Haiku (cross-region inference profile)
- Response field: `body.usage.input_tokens`, `body.usage.output_tokens`
- Pipeline: `'resume-import'`
- One row per resume document extraction call
- Attach: `import_id`

### 3b. `resume-import-processor/src/bedrock/enrich-role.ts`

- Same model and response shape as `extract-career`
- One row per role enrichment call (N calls per resume — one per work entry)
- Attach: `import_id`

### 3c. `resume-import-processor/src/embed.ts`

- Model: Titan Embeddings V2
- Response field: `body.inputTextTokenCount`
- Pipeline: `'resume-import'`
- One row per embedding call
- `output_tokens = 0` (embeddings have no output token charge)
- Attach: `import_id`

### 3d. `ingestion/src/TitanEmbeddingProvider.ts`

- Same model and response shape as `embed.ts`
- Pipeline: `'repo-sync'`
- One row per chunk embedding
- Attach: `repo_name`
- **Requires:** `user_id` threaded from sync job caller into `TitanEmbeddingProvider` — currently missing.

---

## 4. Budget System

### 4a. Default budget

On first Bedrock call, upsert a row into `user_token_budgets` with defaults (`monthly_limit_cents=500`, `alert_threshold_pct=80`). No explicit provisioning step required.

### 4b. Monthly spend query

```sql
SELECT COALESCE(SUM(cost_cents), 0)
FROM prompt_invocations
WHERE user_id = $1
  AND invoked_at >= date_trunc('month', now())
```

### 4c. Soft limit check (runs after each `prompt_invocations` insert)

```
spend    = result of monthly spend query
limit    = user_token_budgets.monthly_limit_cents
threshold = limit × (alert_threshold_pct / 100)

if spend >= limit:
  log WARN "user {id} exceeded monthly Bedrock budget ({spend}¢ / {limit}¢)"
  // NOTE(production): convert to pre-flight BudgetExceededError — reject
  // the job before any Bedrock call is made when monthly spend >= limit.
else if spend >= threshold:
  log WARN "user {id} at {pct}% of monthly Bedrock budget"
```

### 4d. Admin override

Admin can update `monthly_limit_cents` and `alert_threshold_pct` per user via `setUserBudgetFn`. No self-service UI for users in this iteration.

---

## 5. API / Server Functions

| Function | Signature | Used by |
|---|---|---|
| `getUsageSummaryFn` | `({ userId?, month? }) → { rows, totalCents, byPipeline, byModel }` | Admin Cost tab |
| `getUserBudgetFn` | `({ userId }) → UserTokenBudget` | Admin user detail |
| `setUserBudgetFn` | `({ userId, monthlyLimitCents, alertThresholdPct }) → void` | Admin only |

`listResumeImportsFn` is unchanged — cost data is joined on `import_id` in the admin UI query, not surfaced through this function.

---

## 6. Frontend

### 6a. New "Cost" tab in ReportContainer

Tab order: `platform-overview · all · pipelines · chatbot · selfhealing · prompt-quality · cost · content-management · career-docs`

Tab content:

```
┌─ Cost Overview ──────────────────────────────────────────────────┐
│  Stat cards:                                                     │
│    • Total spend this month (USD cents → formatted as $X.XX)    │
│    • Top spending user (email + amount)                          │
│    • Average cost per resume import                              │
│                                                                  │
│  Table: user | pipeline | model | tokens in | tokens out |      │
│         cost ($) | date | import_id / repo                      │
│                                                                  │
│  Filters: user · pipeline (resume-import / repo-sync) · month   │
└──────────────────────────────────────────────────────────────────┘
```

### 6b. No user-facing cost UI

Budget alerts are server-side log warnings only. Users do not see their own spend.

```
// NOTE(production): surface budget status on UserDashboard KB health
// card ("$X.XX used this month") once the pre-flight limit is in place.
```

---

## 7. Known Gaps / Deferred

| Gap | Workaround now | Future fix |
|---|---|---|
| EU cross-region inference surcharge unknown | Use US base rates as floor | Revisit when Anthropic/AWS publish EU-specific pricing |
| No pre-flight hard limit | Post-call log warning | Throw `BudgetExceededError` before job starts (see §4c comment) |
| No user-facing cost visibility | Admin-only dashboard | Surface on UserDashboard after pre-flight limit ships |
| `user_id` not threaded into `TitanEmbeddingProvider` | Must add to sync job context | Wire through job context in this iteration |
| No user list tab in admin to show per-user MTD badge | Deferred | Add when user management tab exists |
