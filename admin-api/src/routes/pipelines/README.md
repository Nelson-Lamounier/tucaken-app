# pipelines

Pipeline-run orchestration: dispatch article / article-eval / strategist Jobs
and poll run status. Mounted at `/api/admin/pipelines` (user JWT). This is the
generic dispatch surface; domain-specific dispatch (coach, case-study,
ingestion) lives with its domain.

## Files

| File | Exports | Purpose |
|---|---|---|
| `pipelines.ts` | `createPipelinesRouter` | All dispatch + status endpoints |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/article-job/:slug` | Dispatch the article-generation Job for a slug |
| POST | `/article-eval-job` | Dispatch the article evaluation Job |
| POST | `/strategist-job` | Dispatch the job-strategist pipeline |
| GET | `/runs/:id` | Poll a pipeline run's status/metadata |

## Design notes

- **Polling, not push** — run progress is read from `pipeline_runs`; see
  ADR 0008 (polling over SSE) for why this is multi-replica and
  blue-green safe.
- Strategist dispatch is gated by
  `lib/jobs/strategist-dispatch-gate.ts` (per-user in-flight dedup +
  throttle) and plan entitlements from `lib/billing/entitlements.ts`;
  quota exhaustion returns 429 with Retry-After.
- Every dispatch writes a `pipeline_runs` row first (via
  `lib/repositories/pipeline-runs.ts`), then creates the K8s Job — a Job
  without a run row is a bug.
- **No retry on model Jobs** — see ADR 0005; failed runs are re-dispatched
  explicitly by the user/operator, never silently.

## Testing

`__tests__/pipelines.test.ts`, `__tests__/pipelines-stage-seeding.test.ts`.

## Related

- [routes overview](../README.md) · [lib/jobs](../../lib/jobs/README.md) · `docs/decisions/0005-no-retry-on-model-jobs.md`, `0008-polling-over-sse.md` (tucaken-app root docs)
