# Ingestion Observability — Distributed Tracing + Grafana Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire end-to-end distributed tracing from the admin-api HTTP request through K8s Job workers (ingestion + resume-import), add a Grafana "Background Jobs" dashboard, and emit structured completion logs with trace_id so every job run is debuggable from a single trace ID.

**Architecture:** admin-api injects `TRACEPARENT` (W3C TraceContext) into each K8s Job env; the worker reads it via an extended `bootstrapK8sObservability({ parentContext: true })`, creates a root span as a child of the admin-api span, and creates child spans per pipeline phase. Structured JSON completion logs include `trace_id` so Loki and Tempo share the same ID. The Grafana dashboard queries Loki + Tempo + Prometheus across the `admin-api`, `ingestion`, and `resume-import` namespaces.

**Tech Stack:** `@opentelemetry/api` (spans, propagation — already installed everywhere), `@opentelemetry/sdk-trace-base` (InMemorySpanExporter for tests), Hono (admin-api), pino (structured logs), Grafana JSON dashboard.

---

## Repos

| Repo | Location |
|---|---|
| admin-api | `/Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring/api/admin-api` |
| ai-applications | `/Users/nelsonlamounier/Desktop/portfolio/ai-applications` |
| kubernetes-bootstrap | `/Users/nelsonlamounier/Desktop/portfolio/kubernetes-bootstrap` |

## File Map

**cdk-monitoring/api/admin-api**
- Modify: `src/lib/k8s-job-builder.ts` — add `traceParentEnv()` helper
- Modify: `src/routes/ingestion.ts` — inject TRACEPARENT in `buildJobSpec`
- Modify: `src/routes/github.ts` — inject TRACEPARENT in `dispatchIngestionJob`

**ai-applications/applications/shared**
- Modify: `src/observability/k8s.ts` — add `parentContext` to `ObservabilityHandle`; extract from `TRACEPARENT` env var after SDK init
- Modify: `src/rds/pipeline/IngestionPipeline.ts` — add phase spans (`ingestion.chunk`, `ingestion.enrich`, `ingestion.embed_upsert`, `ingestion.prune`)
- Test: `src/rds/pipeline/IngestionPipeline.test.ts` — assert spans are created

**ai-applications/applications/ingestion**
- Modify: `src/run-ingestion.ts` — root span `ingestion.pipeline` using `obs.parentContext`; structured completion log with `trace_id`

**ai-applications/applications/resume-import-processor**
- Modify: `src/run-import.ts` — root span `resume_import.pipeline`; child spans per phase; structured completion log
- Modify: `src/tools/tavily.ts` — span `resume_import.tavily_search` per HTTP call

**kubernetes-bootstrap/charts/monitoring/chart/dashboards**
- Create: `background-jobs.json` — unified Grafana dashboard

---

## Task 1: Add `traceParentEnv()` to k8s-job-builder.ts

**Files:**
- Modify: `cdk-monitoring/api/admin-api/src/lib/k8s-job-builder.ts`

`@opentelemetry/api` is already installed in admin-api. `propagation.inject()` uses the W3CTraceContext propagator registered by NodeSDK in `telemetry.ts` (loaded via `--import` before any handler runs). When called inside a Hono request handler, `context.active()` holds the HTTP request span — `inject()` serialises its trace + span ID into a `traceparent` header string.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/k8s-job-builder.test.ts` in the admin-api repo:

```typescript
import { traceParentEnv } from '../k8s-job-builder.js'

describe('traceParentEnv', () => {
    it('returns null when there is no active span', () => {
        // No OTel SDK running in tests → propagation is a no-op
        expect(traceParentEnv()).toBeNull()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring/api/admin-api
npm test -- --testPathPattern k8s-job-builder
```

Expected: FAIL — `traceParentEnv is not a function`

- [ ] **Step 3: Implement `traceParentEnv()`**

Add to the TOP of `src/lib/k8s-job-builder.ts` (after existing imports):

```typescript
import { context as otelContext, propagation } from '@opentelemetry/api';
```

Add this function after the existing `sanitizeLabel` export:

```typescript
/**
 * Serialise the current OTel active span into a W3C TRACEPARENT env var
 * for injection into K8s Job specs. Workers read this to continue the trace.
 * Returns null when no active span exists (e.g. local dev, tests).
 */
export function traceParentEnv(): { name: string; value: string } | null {
    const carrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), carrier);
    const traceparent = carrier['traceparent'];
    return traceparent ? { name: 'TRACEPARENT', value: traceparent } : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --testPathPattern k8s-job-builder
```

Expected: PASS — "returns null when there is no active span"

- [ ] **Step 5: Commit**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring/api/admin-api
git add src/lib/k8s-job-builder.ts src/lib/__tests__/k8s-job-builder.test.ts
git commit -m "feat(observability): add traceParentEnv helper to k8s-job-builder"
```

---

## Task 2: Inject TRACEPARENT in ingestion.ts

**Files:**
- Modify: `cdk-monitoring/api/admin-api/src/routes/ingestion.ts`

`buildJobSpec` builds the env array inline. Add `traceParentEnv()` to the env array. The import is from the same `k8s-job-builder.ts` already in scope (check — currently `ingestion.ts` imports `sanitizeLabel` from a different location; add the import from `k8s-job-builder`).

- [ ] **Step 1: Check current imports in ingestion.ts**

Read lines 1–35 of `src/routes/ingestion.ts`. Confirm `traceParentEnv` is not yet imported.

- [ ] **Step 2: Add import**

In `src/routes/ingestion.ts`, add `traceParentEnv` to the import from `k8s-job-builder`:

```typescript
import { traceParentEnv } from '../lib/k8s-job-builder.js';
```

(This is a new import line — `sanitizeLabel` in ingestion.ts is currently defined locally, not imported. That's fine — keep the local definition, just add this new import.)

- [ ] **Step 3: Inject TRACEPARENT in buildJobSpec env array**

Find the env array inside `buildJobSpec` (currently ending with the `ENRICHMENT_MODEL_ID` entry). Add `traceParentEnv()` injection after all existing env entries:

```typescript
        env: [
            { name: 'USER_ID',        value: userId },
            { name: 'REPO_FULL_NAME', value: repoFullName },
            { name: 'FORCE_REINDEX',  value: String(forceReindex) },
            {
                name:  'ENRICHMENT_MODEL_ID',
                value: process.env['ENRICHMENT_MODEL_ID'] ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
            },
            // Propagate the current HTTP request trace into the Job.
            // traceParentEnv() returns null if no active OTel span (e.g. local dev).
            ...(() => { const tp = traceParentEnv(); return tp ? [tp] : []; })(),
        ],
```

- [ ] **Step 4: Build to verify TypeScript is happy**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring/api/admin-api
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/ingestion.ts
git commit -m "feat(observability): inject TRACEPARENT into ingestion K8s Job spec"
```

---

## Task 3: Inject TRACEPARENT in github.ts

**Files:**
- Modify: `cdk-monitoring/api/admin-api/src/routes/github.ts`

`dispatchIngestionJob` builds its own inline job spec (separate from the one in `ingestion.ts`). Same pattern — add the import and spread `traceParentEnv()` into the env array.

- [ ] **Step 1: Add import**

In `src/routes/github.ts`, add this import near the top with other lib imports:

```typescript
import { traceParentEnv } from '../lib/k8s-job-builder.js';
```

- [ ] **Step 2: Inject TRACEPARENT into dispatchIngestionJob's env array**

The `env` array in `dispatchIngestionJob` (around line 366–377) currently ends with `ENRICHMENT_MODEL_ID`. Add `traceParentEnv()` spread after it:

```typescript
                        env: [
                            { name: 'USER_ID',            value: userId },
                            { name: 'REPO_FULL_NAME',     value: repoFullName },
                            { name: 'FORCE_REINDEX',      value: String(forceReindex) },
                            { name: 'GITHUB_TOKEN',       value: githubToken },
                            {
                                name:  'ENRICHMENT_MODEL_ID',
                                value: process.env['ENRICHMENT_MODEL_ID'] ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
                            },
                            ...(() => { const tp = traceParentEnv(); return tp ? [tp] : []; })(),
                        ],
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/github.ts
git commit -m "feat(observability): inject TRACEPARENT into github dispatchIngestionJob spec"
```

---

## Task 4: Extend bootstrapK8sObservability with parentContext

**Files:**
- Modify: `ai-applications/applications/shared/src/observability/k8s.ts`

After `sdk.start()`, use `propagation.extract()` with the `TRACEPARENT` env var to reconstruct the parent context. Store it as `parentContext` on the handle. Workers use this as the parent when creating their root pipeline span.

The `context`, `propagation`, `ROOT_CONTEXT` references are already lazy-required inside the function (the module already requires `context` and `trace`). Add `propagation` to the same require.

- [ ] **Step 1: Update `ObservabilityHandle` interface**

Add `parentContext` to the interface (lines 30–39 of `src/observability/k8s.ts`):

```typescript
export interface ObservabilityHandle {
    readonly logger: import('pino').Logger;
    readonly registry: import('prom-client').Registry;
    /**
     * The parent OTel context extracted from TRACEPARENT env var.
     * Use this as the third argument to `tracer.startSpan()` so the job's
     * root span is a child of the admin-api dispatch span.
     * If TRACEPARENT was absent, this is the root context (no parent).
     */
    readonly parentContext: import('@opentelemetry/api').Context;
    shutdown(): Promise<void>;
    startMetricsServer(port?: number): http.Server;
}
```

- [ ] **Step 2: Extract TRACEPARENT after SDK init**

Inside `bootstrapK8sObservability`, in the lazy-require block, add `propagation` and `ROOT_CONTEXT`:

```typescript
    const { context, trace, propagation, ROOT_CONTEXT } = require('@opentelemetry/api');
```

Replace the existing `const { context, trace } = require(...)` line with the above.

Then, immediately after `sdk.start()` (or the `if (OTEL_EXPORTER_OTLP_ENDPOINT)` guard), add:

```typescript
    // Extract parent context from TRACEPARENT env var (injected by admin-api
    // into every K8s Job spec). If absent, parentCtx = root context (no parent).
    let parentCtx: import('@opentelemetry/api').Context = ROOT_CONTEXT;
    const traceparent = process.env['TRACEPARENT'];
    if (traceparent) {
        parentCtx = propagation.extract(ROOT_CONTEXT, { traceparent });
    }
```

- [ ] **Step 3: Add `parentContext` to the returned handle**

In the `handle` object literal (line ~136):

```typescript
    const handle: ObservabilityHandle = {
        logger,
        registry,
        parentContext: parentCtx,   // ← add this line
        startMetricsServer(...) { ... },
        async shutdown() { ... },
    };
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/ai-applications
npm run build -w applications/shared
```

Expected: no errors. `ObservabilityHandle` callers that don't use `parentContext` are unaffected (adding a readonly property to an interface is backwards-compatible for consumers that only read from the handle).

- [ ] **Step 5: Commit**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/ai-applications
git add applications/shared/src/observability/k8s.ts
git commit -m "feat(observability): expose parentContext from bootstrapK8sObservability"
```

---

## Task 5: Add phase spans to IngestionPipeline

**Files:**
- Modify: `ai-applications/applications/shared/src/rds/pipeline/IngestionPipeline.ts`
- Test: `ai-applications/applications/shared/src/rds/pipeline/IngestionPipeline.test.ts`

Add `@opentelemetry/api` imports and wrap each phase in `ingestChunks()` with `tracer.startActiveSpan()`. The tracer uses the ambient active context, which is set by the job entrypoint before calling `orchestrator.ingestRepo()`.

- [ ] **Step 1: Install test-only OTel span exporter in shared devDeps**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/ai-applications/applications/shared
npm install --save-dev @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base
```

- [ ] **Step 2: Write the failing span test**

Add a new `describe` block at the bottom of `src/rds/pipeline/IngestionPipeline.test.ts`:

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context } from '@opentelemetry/api';

describe('IngestionPipeline — OTel spans', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        exporter = new InMemorySpanExporter();
        provider = new NodeTracerProvider();
        provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
        provider.register();
    });

    afterEach(async () => {
        await provider.shutdown();
        exporter.reset();
    });

    it('creates ingestion.chunk, ingestion.enrich, ingestion.embed_upsert, ingestion.prune spans', async () => {
        const rootSpan = trace.getTracer('test').startSpan('test.root');
        await context.with(trace.setSpan(context.active(), rootSpan), async () => {
            const pipeline = new IngestionPipeline(
                new FakeVectorStore(),
                new FakeSyncState(),
                new FakeEmbedder(),
            );
            const chunk: RawChunk = {
                filePath:   'src/index.ts',
                chunkIndex: 0,
                content:    'export function main() {}',
                chunkType:  'code',
            };
            await pipeline.ingestChunks('user-1', 'owner/repo', [chunk]);
        });
        rootSpan.end();

        const spanNames = exporter.getFinishedSpans().map(s => s.name);
        expect(spanNames).toContain('ingestion.chunk');
        expect(spanNames).toContain('ingestion.enrich');
        expect(spanNames).toContain('ingestion.embed_upsert');
        expect(spanNames).toContain('ingestion.prune');
    });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/ai-applications/applications/shared
npm test -- --testPathPattern IngestionPipeline
```

Expected: FAIL — span names not found (no spans created yet).

- [ ] **Step 4: Add OTel imports to IngestionPipeline.ts**

Add to the top of `src/rds/pipeline/IngestionPipeline.ts` (after existing imports):

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ingestion-pipeline');
```

- [ ] **Step 5: Wrap phases in `ingestChunks()` with spans**

Replace the body of `ingestChunks()` starting from the try block. The structure of each span wrapper is:

```typescript
// Phase: Chunk
const { chunksToEmbed, missing, unchanged } = await tracer.startActiveSpan('ingestion.chunk', async (span) => {
    try {
        const hashedChunks = rawChunks.map(chunk => ({
            chunk,
            contentHash: createHash('sha256').update(chunk.content).digest('hex'),
        }));
        const candidates = hashedChunks.map(({ chunk, contentHash }) => ({
            filePath: chunk.filePath, chunkIndex: chunk.chunkIndex, contentHash,
        }));
        const { missing, stale, unchanged } = await this.vectorStore.checkContentHashes(userId, repoFullName, candidates);
        const unchangedSet = new Set(unchanged.map(c => `${c.filePath}::${c.chunkIndex}`));
        const chunksToEmbed = hashedChunks.filter(
            ({ chunk }) => !unchangedSet.has(`${chunk.filePath}::${chunk.chunkIndex}`),
        );
        span.setAttributes({ 'chunk.total': rawChunks.length, 'chunk.to_embed': chunksToEmbed.length });
        return { chunksToEmbed, missing, unchanged };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
    } finally {
        span.end();
    }
});

// Phase: Enrich
const enrichedChunks = await tracer.startActiveSpan('ingestion.enrich', async (span) => {
    try {
        const result = await this.enrichChunks(chunksToEmbed.map(c => c.chunk));
        span.setAttribute('chunk.enrich_count', result.length);
        return result;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
    } finally {
        span.end();
    }
});

// Phase: Embed + Upsert
const { embeddedChunks, upsertResult } = await tracer.startActiveSpan('ingestion.embed_upsert', async (span) => {
    try {
        const enrichedByKey = new Map(
            enrichedChunks.map(c => [`${c.filePath}::${c.chunkIndex}`, c] as const),
        );
        const embeddedChunks: DocumentChunk[] = [];
        for (const { chunk, contentHash } of chunksToEmbed) {
            const enriched  = enrichedByKey.get(`${chunk.filePath}::${chunk.chunkIndex}`) ?? chunk;
            const embedText = this.buildEmbedText(enriched.content, repoFullName, enriched.filePath, enriched.heading);
            const embedding = await this.embedder.embed(embedText);
            embeddedChunks.push({ ...enriched, userId, repoFullName, contentHash, embedding });
        }
        const upsertResult = embeddedChunks.length > 0
            ? await this.vectorStore.upsertBatch(embeddedChunks)
            : { inserted: 0, updated: 0, skipped: 0, errors: 0 };
        span.setAttributes({ 'embed.count': embeddedChunks.length, 'upsert.inserted': upsertResult.inserted });
        return { embeddedChunks, upsertResult };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
    } finally {
        span.end();
    }
});

// Phase: Prune
const pruned = await tracer.startActiveSpan('ingestion.prune', async (span) => {
    try {
        const currentFilePaths = [...new Set(rawChunks.map(c => c.filePath))];
        const n = await this.vectorStore.pruneDeletedFiles(userId, repoFullName, currentFilePaths);
        span.setAttribute('prune.count', n);
        return n;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
    } finally {
        span.end();
    }
});
```

The quality + markComplete calls remain outside the spans (they're bookkeeping, not pipeline phases). The final `return { ... }` uses the local variables `upsertResult`, `pruned`, `rawChunks`, etc. extracted from the spans.

The refactored `ingestChunks` method looks like:

```typescript
async ingestChunks(userId: string, repoFullName: string, rawChunks: RawChunk[]): Promise<IngestionReport> {
    const startMs = Date.now();
    await this.syncState.markStarted(userId, repoFullName);

    try {
        const { chunksToEmbed, unchanged } = await tracer.startActiveSpan('ingestion.chunk', async (span) => {
            try {
                const hashedChunks = rawChunks.map(chunk => ({
                    chunk,
                    contentHash: createHash('sha256').update(chunk.content).digest('hex'),
                }));
                const candidates = hashedChunks.map(({ chunk, contentHash }) => ({
                    filePath: chunk.filePath, chunkIndex: chunk.chunkIndex, contentHash,
                }));
                const { missing, stale, unchanged } = await this.vectorStore.checkContentHashes(
                    userId, repoFullName, candidates,
                );
                const unchangedSet = new Set(unchanged.map(c => `${c.filePath}::${c.chunkIndex}`));
                const chunksToEmbed = hashedChunks.filter(
                    ({ chunk }) => !unchangedSet.has(`${chunk.filePath}::${chunk.chunkIndex}`),
                );
                span.setAttributes({ 'chunk.total': rawChunks.length, 'chunk.to_embed': chunksToEmbed.length });
                return { chunksToEmbed, missing, unchanged };
            } catch (err) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                throw err;
            } finally { span.end(); }
        });

        const enrichedChunks = await tracer.startActiveSpan('ingestion.enrich', async (span) => {
            try {
                const result = await this.enrichChunks(chunksToEmbed.map(c => c.chunk));
                span.setAttribute('chunk.enrich_count', result.length);
                return result;
            } catch (err) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                throw err;
            } finally { span.end(); }
        });

        const { upsertResult } = await tracer.startActiveSpan('ingestion.embed_upsert', async (span) => {
            try {
                const enrichedByKey = new Map(
                    enrichedChunks.map(c => [`${c.filePath}::${c.chunkIndex}`, c] as const),
                );
                const embeddedChunks: DocumentChunk[] = [];
                for (const { chunk, contentHash } of chunksToEmbed) {
                    const enriched  = enrichedByKey.get(`${chunk.filePath}::${chunk.chunkIndex}`) ?? chunk;
                    const embedText = this.buildEmbedText(enriched.content, repoFullName, enriched.filePath, enriched.heading);
                    const embedding = await this.embedder.embed(embedText);
                    embeddedChunks.push({ ...enriched, userId, repoFullName, contentHash, embedding });
                }
                const upsertResult = embeddedChunks.length > 0
                    ? await this.vectorStore.upsertBatch(embeddedChunks)
                    : { inserted: 0, updated: 0, skipped: 0, errors: 0 };
                span.setAttributes({ 'embed.count': embeddedChunks.length, 'upsert.inserted': upsertResult.inserted });
                return { upsertResult };
            } catch (err) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                throw err;
            } finally { span.end(); }
        });

        const pruned = await tracer.startActiveSpan('ingestion.prune', async (span) => {
            try {
                const currentFilePaths = [...new Set(rawChunks.map(c => c.filePath))];
                const n = await this.vectorStore.pruneDeletedFiles(userId, repoFullName, currentFilePaths);
                span.setAttribute('prune.count', n);
                return n;
            } catch (err) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                throw err;
            } finally { span.end(); }
        });

        const currentFilePaths = [...new Set(rawChunks.map(c => c.filePath))];
        const quality = computeKbQuality(rawChunks);

        await this.syncState.markComplete(
            userId, repoFullName, currentFilePaths.length,
            rawChunks.length, quality.score,
            quality.breakdown as unknown as Record<string, unknown>,
        );

        return {
            userId, repoFullName,
            totalRawChunks: rawChunks.length,
            embedded:       chunksToEmbed.length,
            skipped:        unchanged.length,
            pruned,
            upsertResult,
            durationMs:     Date.now() - startMs,
            kbQualityScore:     quality.score,
            kbQualityBreakdown: quality.breakdown as unknown as Record<string, unknown>,
        };

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await this.syncState.markError(userId, repoFullName, errorMessage);
        throw err;
    }
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --testPathPattern IngestionPipeline
```

Expected: all tests pass. New span test sees 4 span names.

- [ ] **Step 7: Commit**

```bash
git add applications/shared/src/rds/pipeline/IngestionPipeline.ts \
        applications/shared/src/rds/pipeline/IngestionPipeline.test.ts \
        applications/shared/package.json applications/shared/package-lock.json
git commit -m "feat(observability): add phase spans to IngestionPipeline"
```

---

## Task 6: Root span + completion log in run-ingestion.ts

**Files:**
- Modify: `ai-applications/applications/ingestion/src/run-ingestion.ts`

The ingestion worker entrypoint uses `bootstrapK8sObservability` — after Task 4, `obs.parentContext` holds the extracted parent. We wrap the orchestrator call in a root span and emit a structured completion log with `trace_id`.

- [ ] **Step 1: Add OTel import at top of run-ingestion.ts**

Add after the existing imports:

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ingestion-worker');
```

- [ ] **Step 2: Wrap orchestrator call in root span inside `main()`**

Replace the existing try/catch/finally in `main()`. The key change: create `rootSpan` using `obs.parentContext` before the try block, wrap the orchestrator call in `context.with(trace.setSpan(obs.parentContext, rootSpan), ...)`, end the span in finally, and emit a structured completion log with `trace_id`.

Full replacement of the `main()` function body after `const enricher = ...` and `const pipeline = ...` / `const orchestrator = ...` setup:

```typescript
    const rootSpan = tracer.startSpan('ingestion.pipeline', {
        attributes: {
            'user.id':       env.userId,
            'repo.full_name': env.repoFullName,
            'force_reindex':  env.forceReindex,
        },
    }, obs.parentContext);

    try {
        const report = await context.with(trace.setSpan(obs.parentContext, rootSpan), async () => {
            return env.forceReindex
                ? await orchestrator.forceReindex(env.userId, env.repoFullName)
                : await orchestrator.ingestRepo(env.userId, env.repoFullName);
        });

        chunksProcessed.inc({ phase: 'embedded' }, report.embedded);
        chunksProcessed.inc({ phase: 'skipped' },  report.skipped);
        chunksProcessed.inc({ phase: 'pruned' },   report.pruned);
        rootSpan.setAttributes({
            'chunks.embedded': report.embedded,
            'chunks.pruned':   report.pruned,
        });
        outcome = 'success';

        const { traceId } = rootSpan.spanContext();
        log.info({
            event:          'ingestion.complete',
            status:         'complete',
            trace_id:        traceId,
            user_id:         env.userId,
            repo_full_name:  env.repoFullName,
            job_name:        process.env['JOB_NAME'] ?? 'unknown',
            embedded:        report.embedded,
            skipped:         report.skipped,
            pruned:          report.pruned,
            duration_ms:     report.durationMs,
            kb_quality_score: report.kbQualityScore,
        }, 'complete');

    } catch (err) {
        rootSpan.recordException(err as Error);
        rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        const { traceId } = rootSpan.spanContext();
        log.error({
            event:    'ingestion.complete',
            status:   'error',
            trace_id:  traceId,
            user_id:   env.userId,
            repo_full_name: env.repoFullName,
        }, 'failed');
    } finally {
        rootSpan.end();
        await Promise.allSettled([vectorStore.end(), syncState.end()]);
        const duration = Number(process.hrtime.bigint() - start) / 1e9;
        ingestionRuns.inc({ outcome });
        ingestionDuration.observe({ outcome }, duration);
        await pushFinalMetrics(obs.registry, 'ingestion', `${env.userId}_${env.repoFullName.replace('/', '_')}`);
        await obs.shutdown();
    }
```

- [ ] **Step 3: Build**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/ai-applications
npm run build -w applications/ingestion
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add applications/ingestion/src/run-ingestion.ts
git commit -m "feat(observability): add root span and completion log to ingestion worker"
```

---

## Task 7: Phase spans + completion log in run-import.ts

**Files:**
- Modify: `ai-applications/applications/resume-import-processor/src/run-import.ts`

Wrap each of the 6 pipeline steps in a span. The root span is `resume_import.pipeline`, created using `obs.parentContext` (same pattern as Task 6). The structured completion log emits `trace_id`.

- [ ] **Step 1: Add OTel imports**

Add after existing imports at top of `src/run-import.ts`:

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('resume-import-processor');
```

- [ ] **Step 2: Create root span using obs.parentContext before the try block**

Inside `main()`, after `const searchTool = ...`, add:

```typescript
  const rootSpan = tracer.startSpan('resume_import.pipeline', {
      attributes: {
          'user.id':   env.userId,
          'import.id': env.importId,
      },
  }, obs.parentContext);
```

- [ ] **Step 3: Wrap the main try block in context.with**

The entire `try { ... } catch { ... }` block must run within the root span's context so child spans (created by `tracer.startActiveSpan`) are automatically parented to it. Wrap:

```typescript
  try {
      await context.with(trace.setSpan(obs.parentContext, rootSpan), async () => {
          // Step 1 — fetch
          await tracer.startActiveSpan('resume_import.fetch', async (span) => {
              try {
                  await updateImportStatus(pool, env.importId, 'parsing', 'Downloading resume file');
                  const buf = await fetchFileFromS3(s3, env.assetsBucketName, env.s3Key);
                  span.setAttribute('s3.key', env.s3Key);
                  fileBuffer = buf;
              } catch (err) {
                  span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                  throw err;
              } finally { span.end(); }
          });

          // Step 2 — parse
          await tracer.startActiveSpan('resume_import.parse', async (span) => {
              try {
                  if (env.contentType === 'application/pdf') {
                      const result = await extractTextFromPdf(fileBuffer, env.s3Key, env.assetsBucketName, env.awsRegion);
                      rawText = result.text; extractionMethod = result.method;
                  } else {
                      rawText = await extractTextFromDocx(fileBuffer); extractionMethod = 'mammoth';
                  }
                  span.setAttributes({ 'parse.chars': rawText.length, 'parse.method': extractionMethod });
              } catch (err) {
                  span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                  throw err;
              } finally { span.end(); }
          });

          // Step 3 — extract career data
          let extracted: ExtractedCareerData;
          await tracer.startActiveSpan('resume_import.extract_roles', async (span) => {
              try {
                  await updateImportStatus(pool, env.importId, 'extracting_career', 'Extracting career data', {
                      rawExtractedText: rawText, extractionMethod,
                  });
                  extracted = await extractCareerData(rawText, env.awsRegion);
                  span.setAttributes({
                      'roles.count': extracted.experience.length,
                      'education.count': extracted.education.length,
                  });
              } catch (err) {
                  span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                  throw err;
              } finally { span.end(); }
          });

          // Step 4 — persist
          let experienceIds: string[];
          await tracer.startActiveSpan('resume_import.save_entries', async (span) => {
              try {
                  experienceIds = await persistCareerEntries(pool, env.userId, env.importId, extracted);
                  await updateImportStatus(pool, env.importId, 'ready_for_review', 'Career data extracted', {
                      careerEntriesCreated: experienceIds,
                  });
                  span.setAttribute('entries.saved', experienceIds.length);
              } catch (err) {
                  span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                  throw err;
              } finally { span.end(); }
          });

          // Step 5 — enrichment loop (Tavily spans created inside enrichRole → searchTool.search())
          await updateImportStatus(pool, env.importId, 'enriching', 'Researching roles');
          let totalEmbeddings = 0;

          for (let i = 0; i < extracted.experience.length; i++) {
              const exp = extracted.experience[i];
              const careerEntryId = experienceIds[i];
              if (!careerEntryId) continue;

              await tracer.startActiveSpan('resume_import.enrich_role', {
                  attributes: { 'role.title': exp.title, 'role.company': exp.company, 'role.index': i },
              }, async (span) => {
                  try {
                      const alreadyEnriched = await countEnrichedEntries(pool, env.userId);
                      if (alreadyEnriched >= FREE_TIER_ENRICHMENT_CAP) {
                          span.setAttribute('enrich.skipped_reason', 'free_tier_limit');
                          await pool.query(
                              `UPDATE user_career_history SET enrichment_status = 'skipped', enrichment_skipped_reason = 'free_tier_limit', updated_at = NOW() WHERE id = $1::uuid`,
                              [careerEntryId],
                          );
                          const count = await embedAndPersistEntry(pool, env.awsRegion, env.userId, careerEntryId, exp, null);
                          totalEmbeddings += count;
                          return;
                      }

                      await pool.query(
                          `UPDATE user_career_history SET enrichment_status = 'enriching', updated_at = NOW() WHERE id = $1::uuid`,
                          [careerEntryId],
                      );

                      let enriched = null;
                      try {
                          enriched = await enrichRole(exp, searchTool, env.awsRegion);
                      } catch (err) {
                          span.recordException(err as Error);
                          await pool.query(
                              `UPDATE user_career_history SET enrichment_status = 'failed', updated_at = NOW() WHERE id = $1::uuid`,
                              [careerEntryId],
                          );
                      }

                      if (enriched !== null) {
                          await pool.query(
                              `UPDATE user_career_history SET enrichment_status = 'complete', enriched_data = $1, updated_at = NOW() WHERE id = $2::uuid`,
                              [JSON.stringify(enriched), careerEntryId],
                          );
                      } else if (enriched === null) {
                          await pool.query(
                              `UPDATE user_career_history SET enrichment_status = 'skipped', enrichment_skipped_reason = 'no_search_results', updated_at = NOW() WHERE id = $1::uuid`,
                              [careerEntryId],
                          );
                      }

                      const count = await embedAndPersistEntry(pool, env.awsRegion, env.userId, careerEntryId, exp, enriched);
                      totalEmbeddings += count;
                  } catch (err) {
                      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                  } finally { span.end(); }
              });
          }

          // Step 6 — complete
          await updateImportStatus(pool, env.importId, 'completed', 'Import complete', {
              embeddingsCreatedCount: totalEmbeddings, completedAt: new Date(),
          });
          log.info({ totalEmbeddings }, 'completed');
          outcome = 'success';
          await pool.end();
      });
  } catch (err) {
      errorCode = 'PIPELINE_ERROR';
      rootSpan.recordException(err as Error);
      rootSpan.setStatus({ code: SpanStatusCode.ERROR });
      log.error({ err }, 'fatal error');
      // ... existing pool.query error write + pool.end
  } finally {
      rootSpan.end();
      const { traceId } = rootSpan.spanContext();
      const duration = Number(process.hrtime.bigint() - jobStart) / 1e9;
      importsTotal.inc({ outcome, error_code: errorCode });
      importDurationSeconds.observe({ outcome }, duration);

      // Structured completion log — Loki filters on trace_id to join log stream with Tempo.
      log.info({
          event:          'resume_import.complete',
          status:          outcome === 'success' ? 'complete' : 'error',
          trace_id:        traceId,
          user_id:         env.userId,
          import_id:       env.importId,
          duration_s:      duration,
      }, outcome === 'success' ? 'complete' : 'error');

      await pushFinalMetrics(obs.registry, 'resume-import-processor', env.importId);
      await obs.shutdown();
      process.exit(outcome === 'success' ? 0 : 1);
  }
```

Note: `fileBuffer`, `rawText`, `extractionMethod`, `extracted`, `experienceIds` must be declared as `let` variables before the `context.with` call so they're accessible in each span callback. Add them before `try`:

```typescript
  let fileBuffer: Buffer;
  let rawText = '';
  let extractionMethod = '';
```

`extracted` and `experienceIds` can be declared similarly.

- [ ] **Step 4: Build**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/ai-applications
npm run build -w applications/resume-import-processor
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add applications/resume-import-processor/src/run-import.ts
git commit -m "feat(observability): add phase spans and completion log to resume-import worker"
```

---

## Task 8: Add Tavily search span

**Files:**
- Modify: `ai-applications/applications/resume-import-processor/src/tools/tavily.ts`

The `TavilySearchTool.search()` method makes one HTTP call to Tavily. Wrap it in `resume_import.tavily_search` so we can see per-call latency and result counts in the trace waterfall.

- [ ] **Step 1: Add OTel imports**

At the top of `src/tools/tavily.ts`, add:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('resume-import-processor');
```

- [ ] **Step 2: Wrap `search()` in a span**

Replace the body of `TavilySearchTool.search()`:

```typescript
  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    return tracer.startActiveSpan('resume_import.tavily_search', {
      attributes: { 'tavily.query': query, 'tavily.max_results': maxResults },
    }, async (span) => {
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key:             this.apiKey,
            query,
            search_depth:        'basic',
            max_results:         maxResults,
            include_answer:      false,
            include_raw_content: false,
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          span.setStatus({ code: SpanStatusCode.ERROR, message: `${response.status} ${body}` });
          throw new Error(`Tavily search failed: ${response.status} ${body}`);
        }

        const data = await response.json() as {
          results?: Array<{ title: string; url: string; content: string; score: number }>;
        };

        const results = (data.results ?? []).map((r) => ({
          title: r.title, url: r.url, content: r.content, score: r.score,
        }));
        span.setAttributes({
          'tavily.results_count': results.length,
          'http.status_code':     response.status,
        });
        return results;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    });
  }
```

- [ ] **Step 3: Build**

```bash
npm run build -w applications/resume-import-processor
```

- [ ] **Step 4: Commit**

```bash
git add applications/resume-import-processor/src/tools/tavily.ts
git commit -m "feat(observability): add tavily_search span to TavilySearchTool"
```

---

## Task 9: Grafana Background Jobs Dashboard

**Files:**
- Create: `kubernetes-bootstrap/charts/monitoring/chart/dashboards/background-jobs.json`

Follow the exact JSON format of `resume-import.json` (same directory). Use `uid: "background-jobs"`, `schemaVersion: 39`. The dashboard has 6 rows.

- [ ] **Step 1: Create the dashboard JSON file**

```bash
touch /Users/nelsonlamounier/Desktop/portfolio/kubernetes-bootstrap/charts/monitoring/chart/dashboards/background-jobs.json
```

- [ ] **Step 2: Write the JSON**

Use `resume-import.json` as a structural reference (annotations, links, templating, panel format). The full JSON:

```json
{
  "annotations": {
    "list": [
      {
        "name": "Deploys",
        "datasource": { "type": "loki", "uid": "loki" },
        "enable": true,
        "expr": "{job=\"github-actions\", event=~\"deploy_succeeded|deploy_failed\", service=~\"ingestion|resume-import-processor\"} | json",
        "iconColor": "blue",
        "titleFormat": "{{event}} {{service}} {{git_sha}}",
        "textFormat": "{{run_url}}"
      }
    ]
  },
  "editable": true,
  "graphTooltip": 1,
  "id": null,
  "tags": ["ingestion", "resume-import", "background-jobs", "tracing"],
  "title": "Background Jobs — Ingestion + Resume Import",
  "uid": "background-jobs",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-6h", "to": "now" },
  "timepicker": {},
  "templating": {
    "list": [
      {
        "name": "env",
        "type": "custom",
        "label": "Environment",
        "query": "development,production",
        "current": { "text": "development", "value": "development" },
        "options": [
          { "text": "development", "value": "development", "selected": true },
          { "text": "production",  "value": "production",  "selected": false }
        ],
        "hide": 0
      },
      {
        "name": "user_id",
        "type": "custom",
        "label": "User ID",
        "query": "",
        "current": { "text": "All", "value": "" },
        "options": [],
        "hide": 0
      },
      {
        "name": "trace_id",
        "type": "textbox",
        "label": "Trace ID",
        "query": "",
        "current": { "text": "", "value": "" },
        "hide": 0
      }
    ]
  },
  "panels": [
    {
      "type": "row",
      "title": "Health at a Glance — last 24 h",
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 0 },
      "collapsed": false,
      "id": 1
    },
    {
      "type": "stat",
      "title": "Ingestion jobs — succeeded",
      "id": 2,
      "gridPos": { "h": 4, "w": 4, "x": 0, "y": 1 },
      "datasource": { "type": "loki", "uid": "loki" },
      "options": { "reduceOptions": { "calcs": ["sum"] }, "colorMode": "background", "graphMode": "none" },
      "fieldConfig": {
        "defaults": { "thresholds": { "mode": "absolute", "steps": [{"color":"green","value":null}] }, "color": {"mode":"thresholds"} }
      },
      "targets": [{
        "expr": "count_over_time({namespace=\"ingestion\", level=\"info\"} | json | event=\"ingestion.complete\" | status=\"complete\" [$__range])",
        "legendFormat": "success"
      }]
    },
    {
      "type": "stat",
      "title": "Ingestion jobs — failed",
      "id": 3,
      "gridPos": { "h": 4, "w": 4, "x": 4, "y": 1 },
      "datasource": { "type": "loki", "uid": "loki" },
      "options": { "reduceOptions": { "calcs": ["sum"] }, "colorMode": "background", "graphMode": "none" },
      "fieldConfig": {
        "defaults": { "thresholds": { "mode": "absolute", "steps": [{"color":"green","value":null},{"color":"red","value":1}] }, "color": {"mode":"thresholds"} }
      },
      "targets": [{
        "expr": "count_over_time({namespace=\"ingestion\", level=\"info\"} | json | event=\"ingestion.complete\" | status=\"error\" [$__range])",
        "legendFormat": "failed"
      }]
    },
    {
      "type": "stat",
      "title": "Resume import — succeeded",
      "id": 4,
      "gridPos": { "h": 4, "w": 4, "x": 8, "y": 1 },
      "datasource": { "type": "loki", "uid": "loki" },
      "options": { "reduceOptions": { "calcs": ["sum"] }, "colorMode": "background", "graphMode": "none" },
      "fieldConfig": {
        "defaults": { "thresholds": { "mode": "absolute", "steps": [{"color":"green","value":null}] }, "color": {"mode":"thresholds"} }
      },
      "targets": [{
        "expr": "count_over_time({namespace=\"resume-import\", level=\"info\"} | json | event=\"resume_import.complete\" | status=\"complete\" [$__range])",
        "legendFormat": "success"
      }]
    },
    {
      "type": "stat",
      "title": "Resume import — failed",
      "id": 5,
      "gridPos": { "h": 4, "w": 4, "x": 12, "y": 1 },
      "datasource": { "type": "loki", "uid": "loki" },
      "options": { "reduceOptions": { "calcs": ["sum"] }, "colorMode": "background", "graphMode": "none" },
      "fieldConfig": {
        "defaults": { "thresholds": { "mode": "absolute", "steps": [{"color":"green","value":null},{"color":"red","value":1}] }, "color": {"mode":"thresholds"} }
      },
      "targets": [{
        "expr": "count_over_time({namespace=\"resume-import\", level=\"info\"} | json | event=\"resume_import.complete\" | status=\"error\" [$__range])",
        "legendFormat": "failed"
      }]
    },
    {
      "type": "stat",
      "title": "Active K8s jobs now",
      "id": 6,
      "gridPos": { "h": 4, "w": 4, "x": 16, "y": 1 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "options": { "reduceOptions": { "calcs": ["lastNotNull"] }, "colorMode": "background", "graphMode": "none" },
      "fieldConfig": { "defaults": { "color": { "mode": "thresholds" }, "thresholds": { "mode": "absolute", "steps": [{"color":"green","value":null}] } } },
      "targets": [{
        "expr": "sum(kube_job_status_active{namespace=~\"ingestion|resume-import\"})",
        "legendFormat": "active"
      }]
    },
    {
      "type": "stat",
      "title": "Chunks embedded today",
      "id": 7,
      "gridPos": { "h": 4, "w": 4, "x": 20, "y": 1 },
      "datasource": { "type": "loki", "uid": "loki" },
      "options": { "reduceOptions": { "calcs": ["sum"] }, "colorMode": "value", "graphMode": "none" },
      "fieldConfig": { "defaults": { "unit": "short", "color": { "mode": "thresholds" }, "thresholds": { "mode": "absolute", "steps": [{"color":"blue","value":null}] } } },
      "targets": [{
        "expr": "sum_over_time({namespace=\"ingestion\", level=\"info\"} | json | event=\"ingestion.complete\" | unwrap embedded [$__range])",
        "legendFormat": "chunks"
      }]
    },
    {
      "type": "row",
      "title": "Phase Breakdown — Tempo span durations",
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 5 },
      "collapsed": false,
      "id": 10
    },
    {
      "type": "traces",
      "title": "Ingestion — pipeline spans (Tempo)",
      "id": 11,
      "gridPos": { "h": 10, "w": 12, "x": 0, "y": 6 },
      "datasource": { "type": "tempo", "uid": "tempo" },
      "targets": [{
        "queryType": "traceql",
        "query": "{ resource.service.name = \"ingestion\" }",
        "tableType": "spans"
      }]
    },
    {
      "type": "traces",
      "title": "Resume import — pipeline spans (Tempo)",
      "id": 12,
      "gridPos": { "h": 10, "w": 12, "x": 12, "y": 6 },
      "datasource": { "type": "tempo", "uid": "tempo" },
      "targets": [{
        "queryType": "traceql",
        "query": "{ resource.service.name = \"resume-import-processor\" }",
        "tableType": "spans"
      }]
    },
    {
      "type": "row",
      "title": "Failure Analysis",
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 16 },
      "collapsed": false,
      "id": 20
    },
    {
      "type": "timeseries",
      "title": "Error rate by namespace",
      "id": 21,
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 17 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [{
        "expr": "sum by (namespace) (rate({namespace=~\"ingestion|resume-import\", level=\"error\"} [5m]))",
        "legendFormat": "{{namespace}}"
      }]
    },
    {
      "type": "logs",
      "title": "Last 20 errors — ingestion + resume-import",
      "id": 22,
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 17 },
      "datasource": { "type": "loki", "uid": "loki" },
      "options": { "showTime": true, "wrapLogMessage": true, "dedupStrategy": "none" },
      "targets": [{
        "expr": "{namespace=~\"ingestion|resume-import\", level=\"error\"} | json",
        "maxLines": 20
      }]
    },
    {
      "type": "row",
      "title": "Correlated Log Stream — filter by Trace ID",
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 25 },
      "collapsed": false,
      "id": 30
    },
    {
      "type": "logs",
      "title": "Full chain — admin-api + job pod (filter: $trace_id / $user_id)",
      "id": 31,
      "gridPos": { "h": 14, "w": 24, "x": 0, "y": 26 },
      "datasource": { "type": "loki", "uid": "loki" },
      "options": { "showTime": true, "wrapLogMessage": false, "dedupStrategy": "none" },
      "targets": [{
        "expr": "{namespace=~\"admin-api|ingestion|resume-import\"} | json | trace_id=~\"${trace_id:pipe}\" | user_id=~\"${user_id:pipe}\"",
        "maxLines": 200
      }]
    },
    {
      "type": "row",
      "title": "Trace Waterfall — Tempo",
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 40 },
      "collapsed": false,
      "id": 40
    },
    {
      "type": "traces",
      "title": "Trace detail — paste Trace ID in $trace_id variable above",
      "id": 41,
      "gridPos": { "h": 14, "w": 24, "x": 0, "y": 41 },
      "datasource": { "type": "tempo", "uid": "tempo" },
      "targets": [{
        "queryType": "traceId",
        "query": "${trace_id}"
      }]
    }
  ]
}
```

- [ ] **Step 3: Validate JSON syntax**

```bash
python3 -m json.tool /Users/nelsonlamounier/Desktop/portfolio/kubernetes-bootstrap/charts/monitoring/chart/dashboards/background-jobs.json > /dev/null && echo "valid"
```

Expected: `valid`

- [ ] **Step 4: Commit**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/kubernetes-bootstrap
git add charts/monitoring/chart/dashboards/background-jobs.json
git commit -m "feat(monitoring): add Background Jobs Grafana dashboard"
```

---

## Self-Review Notes

- **TRACEPARENT double-call**: In Tasks 2 and 3, `traceParentEnv()` is called twice (once for the condition, once for the spread). Extract to a variable first: `const tp = traceParentEnv(); ...(tp ? [tp] : [])`. Fix before implementing.
- **`fileBuffer` uninitialized in run-import.ts**: Must declare `let fileBuffer: Buffer;` before the `context.with` call. TypeScript will catch this during build.
- **`extracted` used before assignment**: Declare `let extracted: ExtractedCareerData` before the for loop. TypeScript will error if this is missed.
- **`traceParentEnv` import in admin-api repos**: `k8s-job-builder.ts` already exports `MAX_NAME_LEN` and `sanitizeLabel`. The new function is a named export — no barrel changes needed.
- **Span test may need `TextMapPropagator` registration**: The `InMemorySpanExporter` test in Task 5 only checks that spans are _created_, not that they're parented correctly. The propagation test is already handled by OTel's own test suite. This is sufficient coverage.
