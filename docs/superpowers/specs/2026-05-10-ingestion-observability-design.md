# Ingestion Observability Design

**Date:** 2026-05-10  
**Scope:** End-to-end distributed tracing + correlated logs + Grafana "Background Jobs" dashboard for the ingestion and resume-import pipelines.

---

## Goal

Make the full lifecycle of a background job — from user click in tucaken-app through admin-api, across namespace boundaries, into the K8s Job worker, and through every pipeline phase — visible in a single Grafana dashboard. Failure debugging today requires switching between pod logs across three namespaces with no correlation. After this work, a trace_id in a toast message is enough to find every log line, span, and metric for that job.

---

## Architecture

Trace context originates in admin-api when a job is created. It is injected as a `TRACEPARENT` environment variable into the K8s Job spec. The worker reads `TRACEPARENT` at startup, initialises a TracerProvider connected to Alloy, and creates a root span that is a child of the admin-api span. All pipeline phases create child spans under that root. Loki receives structured logs from every container via Alloy's log scrape; each log line includes `trace_id` so the Grafana logs panel can be filtered by trace.

Metrics (job counts, durations, chunk counts) are pushed to Pushgateway by the worker on completion and scraped by Prometheus. The Grafana dashboard queries Loki (logs), Tempo (traces), and Prometheus (metrics).

---

## Section 1 — Trace Propagation (ingestion-worker)

### TRACEPARENT injection (admin-api)

Both `ingestion.ts` (`buildJobSpec`) and `github.ts` (`dispatchIngestionJob`) inject `TRACEPARENT` into the K8s Job env:

```typescript
import { context, propagation, trace } from '@opentelemetry/api'

function buildTraceParentEnv(): { name: string; value: string } | null {
    const carrier: Record<string, string> = {}
    propagation.inject(context.active(), carrier)
    const tp = carrier['traceparent']
    return tp ? { name: 'TRACEPARENT', value: tp } : null
}
```

The returned object is pushed into the env array of the Job spec alongside the existing env vars. If OTel is not initialised (local dev) the function returns null and the env var is omitted — the worker falls back to a new root trace.

### bootstrapK8sObservability extension

File: `ai-applications/applications/shared/src/observability/bootstrap.ts`

Add a `tracing` boolean option (defaults to false for backwards compat):

```typescript
interface BootstrapOptions {
    serviceName: string
    serviceVersion?: string
    tracing?: boolean        // new
    metrics?: boolean
    logging?: boolean
}
```

When `tracing: true`:
- Read `TRACEPARENT` from `process.env.TRACEPARENT`
- Use `@opentelemetry/propagator-b3` or the W3C TraceContext propagator to extract the parent context
- Initialise a `NodeTracerProvider` with an OTLP/HTTP exporter pointing at `OTEL_EXPORTER_OTLP_ENDPOINT` (same var already set in every Job via admin-api)
- Register the provider globally so `trace.getActiveSpan()` works anywhere in the process

### Ingestion pipeline spans

Root span name: `ingestion.pipeline`  
Service name: `ingestion-worker`

Child spans (sequential, each wrapping its phase):

| Span name | Covers |
|---|---|
| `ingestion.fetch_files` | GitHub API tree + blob fetch via installation token |
| `ingestion.chunk` | Text chunking of all fetched files |
| `ingestion.enrich` | Bedrock Claude call per chunk (BedrockChunkEnricher) |
| `ingestion.embed_upsert` | Titan embed + pgvector upsert for all chunks |
| `ingestion.prune` | Delete stale chunks for removed files |

Span attributes on root: `user.id`, `repo.full_name`, `job.name`, `force_reindex`.  
Span attributes on phase spans: `chunk.count` (on chunk), `model.id` (on enrich + embed_upsert), `error.message` on error.

### Structured completion log

On job completion (success or error) emit one JSON log line:

```json
{
  "level": "info",
  "event": "ingestion.complete",
  "status": "complete|error",
  "user_id": "...",
  "repo_full_name": "...",
  "job_name": "...",
  "trace_id": "...",
  "duration_s": 42.1,
  "chunks_embedded": 2933,
  "file_count": 365,
  "kb_quality_score": 0.80
}
```

`trace_id` is read from the active span context so Loki and Tempo share the same ID.

---

## Section 2 — Trace Propagation (resume-import-processor)

Identical TRACEPARENT injection pattern from admin-api when dispatching a resume-import Job.

### Resume-import pipeline spans

Root span name: `resume_import.pipeline`  
Service name: `resume-import-processor`

Child spans:

| Span name | Covers |
|---|---|
| `resume_import.parse` | PDF/DOCX text extraction |
| `resume_import.extract_roles` | Claude call to extract career entries |
| `resume_import.enrich_role` | Per-role enrichment loop (parent span) |
| `resume_import.tavily_search` | One child span per Tavily HTTP call inside enrich_role |
| `resume_import.save` | Persist career entries to RDS |

Span attributes on `resume_import.tavily_search`: `tavily.query`, `tavily.results_count`, `http.status_code`.

### Structured completion log

```json
{
  "level": "info",
  "event": "resume_import.complete",
  "status": "complete|error",
  "user_id": "...",
  "import_id": "...",
  "trace_id": "...",
  "duration_s": 18.3,
  "roles_extracted": 7,
  "tavily_calls": 14
}
```

---

## Section 3 — Grafana Dashboard Layout

Dashboard name: **Background Jobs**  
File: `kubernetes-bootstrap/charts/monitoring/dashboards/background-jobs.json`  
Datasources used: Loki, Tempo, Prometheus.

### Template variables

| Variable | Source | Purpose |
|---|---|---|
| `$environment` | `label_values(up, deployment_environment)` | Filter all panels to one env |
| `$user_id` | `label_values(job_status_total, user_id)` | Narrow to one user |
| `$trace_id` | Free text input | Drive correlated log + waterfall link |

### Row 1 — Health at a Glance (stat panels)

| Panel | Query | Viz |
|---|---|---|
| Jobs last 24h — success | Loki count where status=complete | stat (green) |
| Jobs last 24h — failed | Loki count where status=error | stat (red) |
| P95 job duration | Tempo: histogram over root spans | gauge |
| Chunks embedded today | Loki sum `chunks_embedded` from completion logs | stat |
| Active jobs now | Loki count where status=running | stat |

### Row 2 — Job Timeline (table)

LogQL on structured completion log lines, filtered by `$user_id` and `$environment`.  
Columns: `job_name`, `user_id`, `repo / import_id`, `status`, `duration_s`, `chunks`, Tempo link (data link → Explore with trace_id extracted from the log line).

### Row 3 — Phase Breakdown (bar chart)

TraceQL query against Tempo:

```
{ resource.service.name =~ "ingestion-worker|resume-import-processor" }
| select(duration, name)
| group by name
```

X axis: phase span name. Y axis: p95 duration. Shows which phase (enrich / embed / Tavily) dominates latency.

### Row 4 — Failure Analysis

| Panel | Query |
|---|---|
| Error rate by phase (time series) | Loki: count `level=error` by `phase` label, filtered by $user_id |
| Last 20 errors (logs panel) | Loki: `{namespace=~"ingestion|resume-import"} | level="error"` filtered by $user_id |
| Bedrock throttle events | Loki: grep `ThrottlingException\|429` from worker containers |

### Row 5 — Correlated Log Stream (logs panel)

Union log stream across namespaces, joined by trace_id:

```logql
{namespace=~"admin-api|ingestion|resume-import"}
  | json
  | trace_id = "$trace_id"
```

When `$trace_id` is blank, falls back to filtering by `$user_id`. Shows the full request → job lifecycle in one scrollable stream.

### Row 6 — Trace Waterfall Link

Dashboard link (not a panel) to Grafana Explore (Tempo datasource) pre-seeded with `$trace_id`. Opens the waterfall showing admin-api parent → all ingestion/resume-import phases → Bedrock + Tavily child spans.

---

## Implementation Notes

- `bootstrapK8sObservability` change is backwards-compatible: existing callers that don't pass `tracing: true` continue to work unchanged.
- TRACEPARENT is optional in the Job spec; workers that receive no TRACEPARENT start a new root trace — useful for manually triggered debug jobs.
- Completion log format is fixed JSON so LogQL `| json` parsing works without a custom pipeline stage.
- The Grafana dashboard JSON will be stored in `kubernetes-bootstrap` and synced to Grafana via the existing ConfigMap-based dashboard provisioner.
- Pushgateway metrics (job counts, durations) are already partially wired via `bootstrapK8sObservability`; this work adds the trace_id label to those metrics so Prometheus queries can correlate with Tempo.

---

## Repositories Affected

| Repo | Change |
|---|---|
| `cdk-monitoring/api/admin-api` | Inject TRACEPARENT in `ingestion.ts` and `github.ts` job specs |
| `ai-applications/applications/shared` | Extend `bootstrapK8sObservability` with `tracing` option |
| `ai-applications/applications/ingestion-worker` | Instrument pipeline phases with OTel spans; emit completion log |
| `ai-applications/applications/resume-import-processor` | Instrument phases + Tavily calls; emit completion log |
| `kubernetes-bootstrap` | Add `background-jobs.json` dashboard to monitoring chart |
