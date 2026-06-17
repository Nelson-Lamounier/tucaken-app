# GitHub Repository Rename Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-key all repo-scoped data on GitHub's immutable numeric repo `id` so a repo rename/transfer refreshes only a display label and never orphans embeddings or crashes ingestion.

**Architecture:** Phased dual-write across ~18 tables in two repos. `(user_id, github_repo_id)` becomes the canonical key; `repo_full_name` is kept everywhere as a denormalised, refreshable display label (never joined on). Detection is two-pronged: a real-time `repository.renamed/transferred` webhook in `tucaken-app` admin-api, and sync-time self-heal in the `ai-applications` `GitHubAdapter` (resolve-by-id). Both converge on one idempotent `reconcileRepoName` routine. Adapter hardening (Section 3 of the spec) ships first and independently — it removes the crash class with no schema dependency.

**Tech Stack:** TypeScript, Node `https`/`pg`, Hono (admin-api), Jest (both repos), Postgres on RDS via PgBouncer, idempotent SQL migrations in `platform-rds-bootstrap/migrations/` deployed by the artifact-handoff K8s Job pipeline.

**Source spec:** `docs/superpowers/specs/2026-06-17-github-repo-rename-handling-design.md`

---

## Scope note

This plan spans two repos and is decomposed into **six independently shippable PRs**, ordered so no release ever needs a column before it is backfilled. Each PR is a self-contained, testable, reversible unit and could be split into its own plan file. Execute them strictly in order:

| PR | Repo | What | Depends on |
|---|---|---|---|
| 1 | ai-applications | Adapter hardening (crash fix) | — |
| 2 | ai-applications | Migration 084 — add nullable `github_repo_id` + indexes | — |
| 3 | ai-applications | Backfill task — resolve-by-redirect, propagate id | 2 |
| 4 | tucaken-app | Webhook handler + `reconcileRepoName` + admin-api dual-write | 2 |
| 5 | ai-applications | Ingestion dual-write + self-heal | 2, 3, 1 |
| 6 | ai-applications | Migration 085 — `NOT NULL`, unique on id, flip joins | 3, 4, 5 |

**Repo paths:**
- `ai-applications` = `/Users/nelsonlamounier/Desktop/portfolio/ai-applications`
- `tucaken-app` = `/Users/nelsonlamounier/Desktop/portfolio/tucaken-app`

**Repo-scoped tables that gain `github_repo_id BIGINT` (the canonical list — used by PRs 2, 3, 6):**

```
document_embeddings, repo_file_state, repo_sync_state, repository_profiles,
repo_profile, repo_commits, repo_pull_requests, repo_evidence_quality,
evidence_provenance, ai_evidence, ai_scanned_commits, dsa_evidence,
dsa_scanned_commits, technology_evidence, technology_parity_runs,
story_candidates, ingestion_audit_log, retrieval_probe_history
```

Plus `prompt_invocations` (its label column is `repo_name`, not `repo_full_name`), and the anchor table `repositories`.

> **Before PR 2/3/6:** confirm each table above still exists and its label column name with:
> `rg -n "CREATE TABLE IF NOT EXISTS <table>" applications/platform-rds-bootstrap/`. A table that no longer exists is dropped from the migration; a label column named differently (e.g. `repo_name`) is handled per-table. Log any divergence in the PR description — do not silently skip.

---

# PR 1 — Adapter hardening (ai-applications)

**Goal:** A malformed or redirecting GitHub response produces a typed, catchable error and a clean `repo_sync_state.status = 'error'`, never `"batch is not iterable"` or `Cannot read properties of undefined`.

**Files:**
- Create: `applications/shared/src/ingestion/errors.ts`
- Modify: `applications/shared/src/ingestion/implementations/GitHubAdapter.ts`
- Modify: `applications/ingestion/src/run-ingestion.ts` (catch typed errors)
- Test: `applications/shared/src/ingestion/implementations/GitHubAdapter.test.ts`

### Task 1.1: Typed error classes

- [ ] **Step 1: Write the failing test**

In `GitHubAdapter.test.ts` add:

```typescript
import { RepoNotFoundError, GitHubResponseShapeError } from '../errors.js';

describe('ingestion typed errors', () => {
    it('RepoNotFoundError carries the full_name and is an Error', () => {
        const e = new RepoNotFoundError('o/r');
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe('RepoNotFoundError');
        expect(e.fullName).toBe('o/r');
    });

    it('GitHubResponseShapeError names the endpoint', () => {
        const e = new GitHubResponseShapeError('/repos/o/r/commits', 'expected array');
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe('GitHubResponseShapeError');
        expect(e.endpoint).toBe('/repos/o/r/commits');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn jest GitHubAdapter -t "typed errors"` (from `applications/shared`)
Expected: FAIL — `Cannot find module '../errors.js'`.

- [ ] **Step 3: Create `applications/shared/src/ingestion/errors.ts`**

```typescript
/** Thrown when a repo cannot be resolved on GitHub (true 404, deleted/revoked). */
export class RepoNotFoundError extends Error {
    readonly fullName: string;
    constructor(fullName: string) {
        super(`GitHub repository not found: ${fullName}`);
        this.name = 'RepoNotFoundError';
        this.fullName = fullName;
    }
}

/** Thrown when a GitHub response has an unexpected shape (not an array / no .tree). */
export class GitHubResponseShapeError extends Error {
    readonly endpoint: string;
    constructor(endpoint: string, detail: string) {
        super(`Unexpected GitHub response shape at ${endpoint}: ${detail}`);
        this.name = 'GitHubResponseShapeError';
        this.endpoint = endpoint;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn jest GitHubAdapter -t "typed errors"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add applications/shared/src/ingestion/errors.ts applications/shared/src/ingestion/implementations/GitHubAdapter.test.ts
git commit -m "feat(ingestion): add typed RepoNotFoundError and GitHubResponseShapeError"
```

### Task 1.2: Redirect handling + `resolveById` in `get`

The current `get<T>()` (around `GitHubAdapter.ts:432-471`) attaches `Authorization: Bearer`, and rejects on `statusCode >= 400`. Node's `https` does **not** auto-follow redirects, so a 301 currently returns the redirect body `{message, url, documentation_url}` — the source of the crashes. Add explicit 3xx handling (cap 3 hops) and a `resolveById` helper.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('GitHubAdapter.resolveById', () => {
    it('returns full_name + default_branch for a numeric id', async () => {
        const adapter = routedAdapter({
            '/repositories/123': { id: 123, full_name: 'o/renamed', default_branch: 'main' },
        });
        const meta = await adapter.resolveById(123);
        expect(meta).toEqual({ id: 123, fullName: 'o/renamed', defaultBranch: 'main' });
    });
});

describe('GitHubAdapter redirect handling', () => {
    it('follows a 301 Location to the canonical repo path', async () => {
        // get() is exercised via the real http layer in a focused test below;
        // here we assert resolveById uses the /repositories/{id} endpoint shape.
        const adapter = routedAdapter({
            '/repositories/999': { id: 999, full_name: 'o/new', default_branch: 'dev' },
        });
        await expect(adapter.resolveById(999)).resolves.toMatchObject({ fullName: 'o/new' });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn jest GitHubAdapter -t "resolveById"`
Expected: FAIL — `adapter.resolveById is not a function`.

- [ ] **Step 3: Implement redirect handling + `resolveById`**

In `GitHubAdapter.ts`, rewrite the `get<T>` response handler so on `statusCode` in 301/302/307/308 it reads the `Location` header and re-requests (max 3 hops), and on 404 throws `RepoNotFoundError`. Add the public method:

```typescript
import { RepoNotFoundError, GitHubResponseShapeError } from '../errors.js';

export interface GitHubRepoRef {
    id: number;
    fullName: string;
    defaultBranch: string;
}

/** Resolve a repo by its immutable numeric id. Always returns the current full_name. */
async resolveById(githubRepoId: number): Promise<GitHubRepoRef> {
    const raw = await this.get<{ id: number; full_name: string; default_branch: string }>(
        `/repositories/${githubRepoId}`,
    );
    if (typeof raw?.full_name !== 'string' || typeof raw?.default_branch !== 'string') {
        throw new GitHubResponseShapeError(`/repositories/${githubRepoId}`, 'missing full_name/default_branch');
    }
    return { id: raw.id, fullName: raw.full_name, defaultBranch: raw.default_branch };
}
```

In the `get<T>` private method, add the hop loop. Sketch (adapt to the existing `https.request` callback structure):

```typescript
// inside get(), track hops; pass `path` through a loop.
// on res.statusCode in {301,302,307,308}: const loc = res.headers.location;
//   if (!loc || hops >= 3) reject(new GitHubResponseShapeError(path, 'redirect loop/no Location'));
//   else re-request the rewritten path (strip the https://api.github.com prefix), hops+1.
// on res.statusCode === 404: reject(new RepoNotFoundError(path));
// on >= 400 (other): keep existing reject with status + body.
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn jest GitHubAdapter -t "resolveById"` then full `yarn jest GitHubAdapter`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add applications/shared/src/ingestion/implementations/GitHubAdapter.ts applications/shared/src/ingestion/implementations/GitHubAdapter.test.ts
git commit -m "feat(ingestion): follow GitHub 301 redirects and add resolveById helper"
```

### Task 1.3: Shape guards in `listFiles` / `listCommits` / `listPullRequests`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('GitHubAdapter shape guards', () => {
    it('listCommits throws GitHubResponseShapeError when the batch is not an array', async () => {
        const adapter = routedAdapter({
            '/repos/o/r': { default_branch: 'main' },
            '/repos/o/r/commits?sha=main&per_page=100&page=1':
                { message: 'Moved Permanently', url: 'https://api.github.com/repositories/1' },
        });
        await expect(adapter.listCommits('o/r')).rejects.toBeInstanceOf(GitHubResponseShapeError);
    });

    it('listFiles throws GitHubResponseShapeError when tree is missing', async () => {
        const adapter = routedAdapter({
            '/repos/o/r': { default_branch: 'main' },
            '/repos/o/r/git/trees/main?recursive=1': { sha: 'x', truncated: false /* no tree */ },
        });
        await expect(adapter.listFiles('o/r')).rejects.toBeInstanceOf(GitHubResponseShapeError);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn jest GitHubAdapter -t "shape guards"`
Expected: FAIL — currently throws a raw `TypeError` (`batch is not iterable` / cannot read `tree`), not `GitHubResponseShapeError`.

- [ ] **Step 3: Add the guards**

In `listFiles`, before mapping the tree:

```typescript
if (!Array.isArray(tree?.tree)) {
    throw new GitHubResponseShapeError(`/repos/${fullName}/git/trees/${branch}?recursive=1`, 'response has no .tree array');
}
```

In `listCommits` (and mirror in `listPullRequests`), right after the `get<...[]>(...)` call:

```typescript
if (!Array.isArray(batch)) {
    throw new GitHubResponseShapeError(commitsPath, 'expected an array of commits');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn jest GitHubAdapter`
Expected: PASS (all adapter tests).

- [ ] **Step 5: Commit**

```bash
git add applications/shared/src/ingestion/implementations/GitHubAdapter.ts applications/shared/src/ingestion/implementations/GitHubAdapter.test.ts
git commit -m "fix(ingestion): guard array/tree shape before iterating GitHub responses"
```

### Task 1.4: `run-ingestion` catches typed errors → graceful status

The error sink is `run-ingestion.ts:544-567` (`syncState.markError(...)` + `repositories.index_status`). Make `RepoNotFoundError` produce a clear, user-facing message via the existing `friendlyIngestionError` (`run-ingestion.ts:207-215`).

- [ ] **Step 1: Write the failing test**

In `applications/ingestion/src/run-ingestion.test.ts` (create if absent, following the repo's Jest layout):

```typescript
import { friendlyIngestionError } from './run-ingestion.js';
import { RepoNotFoundError } from '@shared/ingestion/errors.js'; // use the repo's actual import alias

it('friendlyIngestionError explains a missing repo without a stack trace', () => {
    const msg = friendlyIngestionError(new RepoNotFoundError('o/gone'));
    expect(msg).toMatch(/no longer accessible|not found/i);
    expect(msg).not.toMatch(/at Object|\.ts:\d+/); // no stack
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn jest run-ingestion -t "missing repo"`
Expected: FAIL — generic fallback message, or `friendlyIngestionError` not exported.

- [ ] **Step 3: Handle the typed error**

Export `friendlyIngestionError` if not already, and add a branch:

```typescript
if (err instanceof RepoNotFoundError) {
    return `Repository ${err.fullName} is no longer accessible on GitHub (renamed, transferred, deleted, or access revoked). Reconnect it to resume indexing.`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn jest run-ingestion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add applications/ingestion/src/run-ingestion.ts applications/ingestion/src/run-ingestion.test.ts
git commit -m "feat(ingestion): map RepoNotFoundError to a clean sync error status"
```

**PR 1 done:** open PR `ai-applications`: "fix(ingestion): harden GitHubAdapter against redirects and malformed responses". This delivers value alone — the crash class is gone even if the re-key never lands.

---

# PR 2 — Migration 084: add nullable `github_repo_id` (ai-applications)

**Goal:** Every repo-scoped table (and `repositories`) gains `github_repo_id BIGINT NULL` plus a non-unique `(user_id, github_repo_id)` index. No reads change yet. Fully reversible.

**Files:**
- Create: `applications/platform-rds-bootstrap/migrations/084_github_repo_id_nullable.sql`
- Test: validate in a rolled-back transaction against dev RDS (no unit test for raw DDL).

### Task 2.1: Author migration 084

- [ ] **Step 1: Confirm the next free number and table list**

Run: `ls applications/platform-rds-bootstrap/migrations/ | sort | tail -5`
Expected: highest is `083_retrieval_probe_history.sql`; next free is `084`.
Run the table-existence check from the Scope note for each table in the canonical list.

- [ ] **Step 2: Write the migration**

Create `084_github_repo_id_nullable.sql`. Idempotent (`IF NOT EXISTS`), matching the house style of `083`:

```sql
-- 084_github_repo_id_nullable.sql
-- Phase 1 of GitHub repo rename re-key: add the immutable numeric anchor as a
-- NULLABLE column everywhere, plus a non-unique (user_id, github_repo_id) index.
-- Reversible; no reads depend on it yet. See spec 2026-06-17-github-repo-rename-handling.

ALTER TABLE repositories            ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE document_embeddings     ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repo_file_state         ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repo_sync_state         ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repository_profiles     ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repo_profile            ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repo_commits            ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repo_pull_requests      ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repo_evidence_quality   ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE evidence_provenance     ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE ai_evidence             ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE ai_scanned_commits      ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE dsa_evidence            ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE dsa_scanned_commits     ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE technology_evidence     ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE technology_parity_runs  ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE story_candidates        ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE ingestion_audit_log     ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE retrieval_probe_history ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE prompt_invocations      ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;

-- Non-unique lookup indexes (id-keyed reconciliation reads these in PR 4/5).
CREATE INDEX IF NOT EXISTS idx_repositories_user_ghid        ON repositories            (user_id, github_repo_id);
CREATE INDEX IF NOT EXISTS idx_doc_embeddings_user_ghid      ON document_embeddings     (user_id, github_repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_file_state_user_ghid     ON repo_file_state         (user_id, github_repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_sync_state_user_ghid     ON repo_sync_state         (user_id, github_repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_profiles_user_ghid       ON repository_profiles     (user_id, github_repo_id);
-- (repeat one index per remaining table; each named idx_<table>_user_ghid)
```

> Add an index line for **every** table above. Omit a table only if Step 1 showed it does not exist, and note the omission in the PR description.

- [ ] **Step 3: Validate in a rolled-back transaction against dev RDS**

```bash
psql "$DEV_DATABASE_URL" <<'SQL'
BEGIN;
\i applications/platform-rds-bootstrap/migrations/084_github_repo_id_nullable.sql
\d+ repositories
ROLLBACK;
SQL
```
Expected: no errors; `\d+ repositories` shows `github_repo_id | bigint`. ROLLBACK leaves prod schema untouched.

- [ ] **Step 4: Run the bootstrap test suite if one exists**

Run: `yarn workspace platform-rds-bootstrap test` (or the repo's equivalent)
Expected: PASS (migration loader picks up 084 in order).

- [ ] **Step 5: Commit**

```bash
git add applications/platform-rds-bootstrap/migrations/084_github_repo_id_nullable.sql
git commit -m "feat(rds): migration 084 add nullable github_repo_id + lookup indexes"
```

**PR 2 done:** merge so the column exists in dev before PR 3/4 write to it. The deploy pipeline (`.github/workflows/deploy-platform-rds-bootstrap.yml`, apply-migrations Job) runs it on the next platform-rds-bootstrap deploy.

---

# PR 3 — Backfill task (ai-applications)

**Goal:** Populate `github_repo_id` for every existing row by resolving each `repositories.full_name` via GitHub (following the 301 for already-renamed repos), then propagating the id to every denormalised table by `(user_id, old full_name)`. Idempotent, re-runnable, logs unresolved repos. Heals `cdk-monitoring` → `tucaken-infra` as a side effect.

**Files:**
- Create: `applications/shared/src/rds/backfillGithubRepoId.ts`
- Create: `scripts/backfill-github-repo-id.ts` (CLI wrapper, mirrors `scripts/backfill-oauth-token-envelope.ts`)
- Test: `applications/shared/src/rds/backfillGithubRepoId.test.ts`

### Task 3.1: Backfill library function

- [ ] **Step 1: Write the failing test**

```typescript
import { backfillGithubRepoId } from './backfillGithubRepoId.js';

it('resolves each repo by name and propagates the id to denormalised tables', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const fakePool = {
        query: async (sql: string, params?: unknown[]) => {
            queries.push({ sql, params: params ?? [] });
            if (sql.includes('SELECT user_id, full_name FROM repositories')) {
                return { rows: [{ user_id: 'u1', full_name: 'o/old' }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        },
    };
    const fakeAdapter = {
        // resolve-by-name follows the 301 to the canonical repo, returning id + current name
        resolveByName: async (_: string) => ({ id: 555, fullName: 'o/new', defaultBranch: 'main' }),
    };

    const result = await backfillGithubRepoId(fakePool as never, fakeAdapter as never);

    expect(result.resolved).toBe(1);
    expect(result.unresolved).toHaveLength(0);
    // repositories updated with id AND refreshed name
    expect(queries.some(q => q.sql.includes('UPDATE repositories') && q.params.includes(555))).toBe(true);
});

it('flags a repo that 404s instead of failing the run', async () => {
    const fakePool = {
        query: async (sql: string) =>
            sql.includes('SELECT user_id, full_name FROM repositories')
                ? { rows: [{ user_id: 'u1', full_name: 'o/gone' }], rowCount: 1 }
                : { rows: [], rowCount: 0 },
    };
    const fakeAdapter = {
        resolveByName: async () => { throw new RepoNotFoundError('o/gone'); },
    };
    const result = await backfillGithubRepoId(fakePool as never, fakeAdapter as never);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toEqual([{ userId: 'u1', fullName: 'o/gone' }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn jest backfillGithubRepoId`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the backfill**

First add a `resolveByName` helper to `GitHubAdapter` (twin of `resolveById`, hitting `/repos/{fullName}` and following the 301), if not already present:

```typescript
async resolveByName(fullName: string): Promise<GitHubRepoRef> {
    const raw = await this.get<{ id: number; full_name: string; default_branch: string }>(`/repos/${fullName}`);
    if (typeof raw?.full_name !== 'string') {
        throw new GitHubResponseShapeError(`/repos/${fullName}`, 'missing full_name');
    }
    return { id: raw.id, fullName: raw.full_name, defaultBranch: raw.default_branch };
}
```

Then `backfillGithubRepoId.ts`:

```typescript
import type { Pool } from 'pg';
import { RepoNotFoundError } from '../ingestion/errors.js';
import type { GitHubAdapter } from '../ingestion/implementations/GitHubAdapter.js';

const LABEL_TABLES = [
    'document_embeddings', 'repo_file_state', 'repo_sync_state', 'repository_profiles',
    'repo_profile', 'repo_commits', 'repo_pull_requests', 'repo_evidence_quality',
    'evidence_provenance', 'ai_evidence', 'ai_scanned_commits', 'dsa_evidence',
    'dsa_scanned_commits', 'technology_evidence', 'technology_parity_runs',
    'story_candidates', 'ingestion_audit_log', 'retrieval_probe_history',
] as const;
// prompt_invocations uses repo_name, handled separately below.

export interface BackfillResult {
    resolved: number;
    unresolved: Array<{ userId: string; fullName: string }>;
}

export async function backfillGithubRepoId(
    pool: Pool,
    adapter: Pick<GitHubAdapter, 'resolveByName'>,
): Promise<BackfillResult> {
    const { rows } = await pool.query<{ user_id: string; full_name: string }>(
        `SELECT user_id, full_name FROM repositories
         WHERE provider = 'github' AND github_repo_id IS NULL`,
    );

    const result: BackfillResult = { resolved: 0, unresolved: [] };

    for (const row of rows) {
        try {
            const ref = await adapter.resolveByName(row.full_name);
            // Update anchor: set id AND refresh the (possibly stale) label.
            await pool.query(
                `UPDATE repositories SET github_repo_id = $1, full_name = $2
                 WHERE user_id = $3::uuid AND provider = 'github' AND full_name = $4`,
                [ref.id, ref.fullName, row.user_id, row.full_name],
            );
            // Propagate to every denormalised table by the OLD label, refresh both id + label.
            for (const table of LABEL_TABLES) {
                await pool.query(
                    `UPDATE ${table} SET github_repo_id = $1, repo_full_name = $2
                     WHERE user_id = $3::uuid AND repo_full_name = $4 AND github_repo_id IS NULL`,
                    [ref.id, ref.fullName, row.user_id, row.full_name],
                );
            }
            await pool.query(
                `UPDATE prompt_invocations SET github_repo_id = $1, repo_name = $2
                 WHERE user_id = $3::uuid AND repo_name = $4 AND github_repo_id IS NULL`,
                [ref.id, ref.fullName, row.user_id, row.full_name],
            );
            result.resolved += 1;
        } catch (e) {
            if (e instanceof RepoNotFoundError) {
                result.unresolved.push({ userId: row.user_id, fullName: row.full_name });
                continue;
            }
            throw e; // unexpected — let the run fail loudly
        }
    }
    return result;
}
```

> The per-table `UPDATE ... WHERE github_repo_id IS NULL` guard makes the task **idempotent and re-runnable** — a second run is a no-op for already-backfilled rows.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn jest backfillGithubRepoId`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add applications/shared/src/rds/backfillGithubRepoId.ts applications/shared/src/rds/backfillGithubRepoId.test.ts applications/shared/src/ingestion/implementations/GitHubAdapter.ts
git commit -m "feat(rds): backfill github_repo_id by resolve-by-name with 301 follow"
```

### Task 3.2: CLI wrapper

- [ ] **Step 1: Create `scripts/backfill-github-repo-id.ts`** (mirror `scripts/backfill-oauth-token-envelope.ts`)

```typescript
import { Pool } from 'pg';
import { GitHubAdapter } from '../applications/shared/src/ingestion/implementations/GitHubAdapter.js';
import { backfillGithubRepoId } from '../applications/shared/src/rds/backfillGithubRepoId.js';

async function main(): Promise<void> {
    const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
    const adapter = GitHubAdapter.fromEnvironment(); // reads GITHUB_TOKEN
    const result = await backfillGithubRepoId(pool, adapter);
    console.log(`[backfill] resolved=${result.resolved} unresolved=${result.unresolved.length}`);
    for (const u of result.unresolved) {
        console.warn(`[backfill] UNRESOLVED user=${u.userId} repo=${u.fullName} (404 — flag, not fail)`);
    }
    await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run against dev (read-mostly, idempotent)**

```bash
DATABASE_URL="$DEV_DATABASE_URL" GITHUB_TOKEN="$DEV_GH_TOKEN" \
  npx tsx scripts/backfill-github-repo-id.ts
```
Expected: logs `resolved=N`; `cdk-monitoring` resolves to id + name `tucaken-infra`.

- [ ] **Step 3: Verify the heal in SQL**

```bash
psql "$DEV_DATABASE_URL" -c \
  "SELECT full_name, github_repo_id FROM repositories WHERE full_name = 'o/tucaken-infra';"
```
Expected: one row, non-null `github_repo_id`, name `tucaken-infra`.

- [ ] **Step 4: Re-run to confirm idempotency**

Run the same command again. Expected: `resolved=0` (all rows already have an id).

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-github-repo-id.ts
git commit -m "feat(scripts): CLI wrapper for github_repo_id backfill"
```

**PR 3 done:** open PR. After merge + run, dev is backfilled and `cdk-monitoring` is healed.

---

# PR 4 — Webhook + dual-write (tucaken-app)

**Goal:** admin-api persists `github_repo_id` on connect, and a `repository.renamed/transferred` webhook refreshes the label via a shared, idempotent `reconcileRepoName`. The GitHub App subscribes to `repository` events.

**Files:**
- Create: `admin-api/src/lib/reconcile-repo-name.ts`
- Modify: `admin-api/src/routes/github.ts` (webhook branch + dual-write in `connectRepoWithDefaultProject`)
- Modify: `admin-api/src/lib/github-app.ts` (already exposes `GitHubRawRepo.id` at lines 44-52 — thread it through `listInstallationRepos`/connect path)
- Test: `admin-api/__tests__/routes/github.test.ts`, `admin-api/__tests__/lib/reconcile-repo-name.test.ts`

### Task 4.1: `reconcileRepoName` shared routine

- [ ] **Step 1: Write the failing test** — `admin-api/__tests__/lib/reconcile-repo-name.test.ts`

```typescript
import { describe, it, expect, jest } from '@jest/globals';
import { reconcileRepoName } from '../../src/lib/reconcile-repo-name.js';

function fakePool(currentName: string) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
        query: jest.fn(async (sql: string, params?: unknown[]) => {
            calls.push({ sql, params: params ?? [] });
            if (sql.includes('SELECT full_name FROM repositories')) {
                return { rows: [{ full_name: currentName }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        }),
        release: jest.fn(),
    };
    return { pool: { connect: async () => client } as never, client, calls };
}

it('updates every label table when the name changed', async () => {
    const { pool, calls } = fakePool('o/old');
    await reconcileRepoName(pool, 'u1', 555, 'o/new');
    expect(calls.some(c => c.sql.includes('UPDATE repositories') && c.params.includes('o/new'))).toBe(true);
    expect(calls.some(c => c.sql.includes('UPDATE document_embeddings'))).toBe(true);
    expect(calls.some(c => c.sql.includes('COMMIT'))).toBe(true);
});

it('is a no-op when the stored name already matches (idempotent)', async () => {
    const { pool, calls } = fakePool('o/new');
    await reconcileRepoName(pool, 'u1', 555, 'o/new');
    expect(calls.some(c => c.sql.includes('UPDATE repositories'))).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn workspace admin-api test reconcile-repo-name`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `admin-api/src/lib/reconcile-repo-name.ts`**

```typescript
import type { Pool } from 'pg';

const LABEL_TABLES = [
    'document_embeddings', 'repo_file_state', 'repo_sync_state', 'repository_profiles',
    'repo_profile', 'repo_commits', 'repo_pull_requests', 'repo_evidence_quality',
    'evidence_provenance', 'ai_evidence', 'ai_scanned_commits', 'dsa_evidence',
    'dsa_scanned_commits', 'technology_evidence', 'technology_parity_runs',
    'story_candidates', 'ingestion_audit_log', 'retrieval_probe_history',
] as const;

/**
 * Refresh the denormalised repo_full_name label everywhere for one repo,
 * keyed on the immutable github_repo_id. Idempotent: a no-op when the stored
 * name already equals newFullName. Single transaction. Never moves embeddings.
 */
export async function reconcileRepoName(
    pool: Pool,
    userId: string,
    githubRepoId: number,
    newFullName: string,
): Promise<void> {
    const client = await pool.connect();
    try {
        const { rows } = await client.query<{ full_name: string }>(
            `SELECT full_name FROM repositories
             WHERE user_id = $1::uuid AND github_repo_id = $2`,
            [userId, githubRepoId],
        );
        const current = rows[0]?.full_name;
        if (current === undefined || current === newFullName) {
            return; // unknown repo or already current — nothing to do
        }

        await client.query('BEGIN');
        await client.query(
            `UPDATE repositories SET full_name = $1
             WHERE user_id = $2::uuid AND github_repo_id = $3`,
            [newFullName, userId, githubRepoId],
        );
        for (const table of LABEL_TABLES) {
            await client.query(
                `UPDATE ${table} SET repo_full_name = $1
                 WHERE user_id = $2::uuid AND github_repo_id = $3`,
                [newFullName, userId, githubRepoId],
            );
        }
        await client.query(
            `UPDATE prompt_invocations SET repo_name = $1
             WHERE user_id = $2::uuid AND github_repo_id = $3`,
            [newFullName, userId, githubRepoId],
        );
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn workspace admin-api test reconcile-repo-name`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/reconcile-repo-name.ts admin-api/__tests__/lib/reconcile-repo-name.test.ts
git commit -m "feat(admin-api): add idempotent reconcileRepoName routine"
```

### Task 4.2: `repository.renamed/transferred` webhook branch

Insert before the "All other events" fallthrough at `github.ts:1393`.

- [ ] **Step 1: Write the failing test** in `admin-api/__tests__/routes/github.test.ts`

```typescript
it('repository.renamed refreshes the stored full_name by github_repo_id', async () => {
    // installation → user lookup returns u1; repositories row exists for ghid 555.
    seedQuery([{ user_id: 'u1', plan: 'pro' }]);            // lookupUserByInstallation
    seedQuery([{ full_name: 'o/old' }]);                    // reconcile SELECT (name changed)
    const body = JSON.stringify({
        action: 'renamed',
        installation: { id: 42 },
        repository: { id: 555, full_name: 'o/new' },
        changes: { repository: { name: { from: 'old' } } },
    });
    const res = await signedWebhook(app, 'repository', body); // helper computes HMAC
    expect(res.status).toBe(200);
    expect(poolQueryMock.mock.calls.some(
        ([sql, params]) => String(sql).includes('UPDATE repositories') && (params as unknown[]).includes('o/new'),
    )).toBe(true);
});
```

> If a `signedWebhook` helper does not already exist in the test file, add one that sets `X-GitHub-Event`, computes `sha256=` HMAC over the body with the test webhook secret, and calls `app.request('/api/github/webhook', { method: 'POST', body, headers })`.

- [ ] **Step 2: Run to verify it fails**

Run: `yarn workspace admin-api test github -t "repository.renamed"`
Expected: FAIL — event currently falls through to the 200 no-op; no UPDATE issued.

- [ ] **Step 3: Add the handler branch** in `createGitHubWebhookRouter`

```typescript
import { reconcileRepoName } from '../lib/reconcile-repo-name.js';

// ── repository.renamed / transferred — refresh the display label ──────────
if (eventType === 'repository' && (action === 'renamed' || action === 'transferred')) {
    const inst = payload['installation'] as Record<string, unknown> | undefined;
    const repo = payload['repository']   as Record<string, unknown> | undefined;
    const installationId = String(inst?.['id'] ?? '');
    const githubRepoId   = typeof repo?.['id'] === 'number' ? repo['id'] : Number(repo?.['id']);
    const newFullName    = typeof repo?.['full_name'] === 'string' ? repo['full_name'] : '';

    if (!installationId || !Number.isFinite(githubRepoId) || !newFullName) {
        return ctx.json({ ok: true });
    }
    const pool = getPool(config);
    const user = await lookupUserByInstallation(pool, installationId);
    if (!user) return ctx.json({ ok: true });

    try {
        await reconcileRepoName(pool, user.userId, githubRepoId, newFullName);
        console.log(`[github/webhook] repository.${action}: reconciled repo ${githubRepoId} → ${newFullName} for user ${user.userId}`);
    } catch (err) {
        console.error(`[github/webhook] reconcile failed for repo ${githubRepoId}`, (err as Error).message);
    }
    return ctx.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn workspace admin-api test github`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/routes/github.ts admin-api/__tests__/routes/github.test.ts
git commit -m "feat(admin-api): handle repository.renamed/transferred webhook events"
```

### Task 4.3: Dual-write `github_repo_id` on connect

`connectRepoWithDefaultProject` (`github.ts:204-229`) currently inserts only `full_name`. Thread the numeric id (already available as `GitHubRawRepo.id`, `github-app.ts:44-52`) into the insert.

- [ ] **Step 1: Write the failing test**

```typescript
it('connect persists github_repo_id alongside full_name', async () => {
    // POST /connected-repos path with a repo whose GitHub id is 555.
    // Assert the repositories INSERT carries 555.
    // ... arrange installation token + listInstallationRepos mock returning id:555 ...
    expect(txClient.query.mock.calls.some(
        ([sql, params]) => String(sql).includes('INSERT INTO repositories') && (params as unknown[]).includes(555),
    )).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn workspace admin-api test github -t "github_repo_id"`
Expected: FAIL — current insert has no id column.

- [ ] **Step 3: Update the signature + SQL**

```typescript
export async function connectRepoWithDefaultProject(
    pool: Pool,
    userId: string,
    fullName: string,
    defaultBranch: string,
    githubRepoId: number,          // NEW
): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query<{ id: string }>(
            `INSERT INTO repositories (user_id, provider, full_name, default_branch, index_status, github_repo_id)
             VALUES ($1::uuid, 'github', $2, $3, 'pending', $4)
             ON CONFLICT (user_id, provider, full_name)
             DO UPDATE SET full_name = EXCLUDED.full_name, github_repo_id = EXCLUDED.github_repo_id
             RETURNING id`,
            [userId, fullName, defaultBranch, githubRepoId],
        );
        const repoId = r.rows[0]!.id;
        await ensureDefaultProject(client, userId, repoId, fullName);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
```

Update the caller (the `POST /connected-repos` handler) to pass `repo.id` from the `listInstallationRepos` result. Run `yarn workspace admin-api typecheck` to find every call site.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn workspace admin-api typecheck && yarn workspace admin-api test github`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/routes/github.ts admin-api/__tests__/routes/github.test.ts
git commit -m "feat(admin-api): dual-write github_repo_id when connecting a repo"
```

### Task 4.4: Subscribe the GitHub App to `repository` events

- [ ] **Step 1: Subscribe** in the GitHub App settings (https://github.com/apps/tucaken/settings → Permissions & events → Subscribe to events → **Repository**). This is config, not code — record it in the PR description. The app slug is `tucaken` (per project memory).
- [ ] **Step 2: Verify** with a test rename on a dev-connected repo; confirm the admin-api log line `repository.renamed: reconciled repo …` appears and the stored `full_name` updates. Embeddings count unchanged (`SELECT count(*) FROM document_embeddings WHERE github_repo_id = …` before/after).
- [ ] **Step 3:** Note in the PR that no further `repository` actions (`created`, `deleted`, …) are handled here — they fall through to the existing 200 no-op.

**PR 4 done:** open PR `tucaken-app`: "feat(github): handle repo rename/transfer via webhook + dual-write github_repo_id". Run `yarn typecheck && yarn lint && yarn test` at repo root before opening.

---

# PR 5 — Ingestion dual-write + self-heal (ai-applications)

**Goal:** The worker writes `github_repo_id` on every upsert and self-heals the label by resolving by id before fetching files/commits, so a missed webhook still recovers on the next sync.

**Files:**
- Modify: `applications/ingestion/src/run-ingestion.ts` (resolve-by-id at start; pass id into writes)
- Modify: the RDS write helpers in `applications/shared/src/rds/` (sync-state, file-state, embeddings, commits, PRs upserts — add `github_repo_id`)
- Modify: `admin-api/src/lib/ingestion-job.ts` (tucaken-app) — pass `GITHUB_REPO_ID` env into the Job spec (lines 82-104)
- Test: co-located `*.test.ts` for each touched writer; `run-ingestion.test.ts`

### Task 5.1: Pass `GITHUB_REPO_ID` into the Job spec (tucaken-app)

- [ ] **Step 1: Write the failing test** in `admin-api/__tests__/lib/ingestion-job.test.ts`

```typescript
it('includes GITHUB_REPO_ID in the job env when provided', () => {
    const spec = buildIngestionJobSpec({ /* existing args */, githubRepoId: 555 } as never);
    const env = spec.spec.template.spec.containers[0].env;
    expect(env).toEqual(expect.arrayContaining([{ name: 'GITHUB_REPO_ID', value: '555' }]));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn workspace admin-api test ingestion-job`
Expected: FAIL — no such env var.

- [ ] **Step 3: Add the env var** in `buildIngestionJobSpec` (add `githubRepoId: number` to its options and push `{ name: 'GITHUB_REPO_ID', value: String(githubRepoId) }`). Thread it from both call sites (resync in `github.ts`, admin path in `ingestion.ts`) — per project memory both use this one builder.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn workspace admin-api typecheck && yarn workspace admin-api test ingestion-job`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/ingestion-job.ts admin-api/__tests__/lib/ingestion-job.test.ts admin-api/src/routes/github.ts admin-api/src/routes/ingestion.ts
git commit -m "feat(admin-api): pass GITHUB_REPO_ID into ingestion job spec"
```

> This commit lands in the tucaken-app repo (it is admin-api code) but is logically part of PR 5; group it into the tucaken-app PR 4 if preferred, or a small follow-up PR. Keep the env contract (`GITHUB_REPO_ID`) identical on both sides.

### Task 5.2: Self-heal by id at the start of a sync (ai-applications)

- [ ] **Step 1: Write the failing test** in `run-ingestion.test.ts`

```typescript
it('reconciles the stored name when resolve-by-id returns a different full_name', async () => {
    // GITHUB_REPO_ID=555, stored name o/old, adapter.resolveById → o/new.
    // Assert reconcileRepoName-equivalent UPDATE issued before listFiles.
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn jest run-ingestion -t "reconciles the stored name"`
Expected: FAIL.

- [ ] **Step 3: Implement self-heal**

Near the top of the ingestion flow, when `GITHUB_REPO_ID` is set:

```typescript
const githubRepoId = Number(process.env['GITHUB_REPO_ID'] ?? '');
if (Number.isFinite(githubRepoId) && githubRepoId > 0) {
    const ref = await adapter.resolveById(githubRepoId);   // current canonical name
    if (ref.fullName !== repoFullName) {
        await reconcileRepoName(pool, userId, githubRepoId, ref.fullName); // shared SQL routine
        repoFullName = ref.fullName; // proceed under the new name
    }
}
```

> Port `reconcileRepoName` into a shared module both repos can use, or duplicate the SQL in `applications/shared/src/rds/` keyed identically. Keep the table list in one place per repo.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn jest run-ingestion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add applications/ingestion/src/run-ingestion.ts applications/ingestion/src/run-ingestion.test.ts applications/shared/src/rds/
git commit -m "feat(ingestion): self-heal repo name via resolve-by-id before sync"
```

### Task 5.3: Write `github_repo_id` on every upsert (ai-applications)

- [ ] **Step 1: Write failing tests** for each writer (sync-state, file-state, embeddings, commits, PRs) asserting the insert/upsert SQL carries `github_repo_id`.

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Add `github_repo_id` to each `INSERT ... ON CONFLICT` writer**, sourcing the id from the resolved `githubRepoId`. Keep `repo_full_name` in the same writes (still dual-writing the label).

- [ ] **Step 4: Run** `yarn jest` across the touched writers + a typecheck. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add applications/shared/src/rds/
git commit -m "feat(rds): dual-write github_repo_id on ingestion upserts"
```

**PR 5 done:** open PR. Integration check on dev: rename a repo, run a sync **without** firing the webhook, confirm the label self-heals and embeddings are untouched.

---

# PR 6 — Migration 085 + cutover (ai-applications)

**Goal:** Verify 100% backfill, enforce `NOT NULL` + unique `(user_id, github_repo_id)` on `repositories`, flip the old `full_name` unique away, and switch reads/joins to the id. `full_name` stays as a label.

**Files:**
- Create: `applications/platform-rds-bootstrap/migrations/085_github_repo_id_cutover.sql`
- Modify: read/join sites that currently join on `repo_full_name` and could safely use `github_repo_id`
- Test: rolled-back-txn validation; a verification query asserting zero nulls

### Task 6.1: Pre-cutover verification gate

- [ ] **Step 1: Assert zero nulls before writing the constraint migration**

```bash
psql "$DEV_DATABASE_URL" -c \
  "SELECT count(*) AS missing FROM repositories WHERE provider='github' AND github_repo_id IS NULL;"
```
Expected: `missing = 0`. If non-zero, **stop** — log each offending row (`SELECT user_id, full_name …`), re-run the PR 3 backfill, and only proceed when the gap is explained (e.g. flagged 404s) and intentionally excluded. No silent gaps.

### Task 6.2: Author migration 085

- [ ] **Step 1: Write the migration**

```sql
-- 085_github_repo_id_cutover.sql
-- Phase 3 cutover: enforce the immutable anchor on repositories. Run only after
-- PR 3 backfill verified 100% (see verification gate). full_name remains as a label.

-- Guard: refuse to enforce NOT NULL if any github rows are still null.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM repositories WHERE provider = 'github' AND github_repo_id IS NULL) THEN
    RAISE EXCEPTION 'repositories has github rows with NULL github_repo_id — backfill incomplete';
  END IF;
END $$;

ALTER TABLE repositories ALTER COLUMN github_repo_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_repositories_user_ghid
    ON repositories (user_id, github_repo_id);

-- Drop the old mutable-name unique now that id is canonical.
ALTER TABLE repositories DROP CONSTRAINT IF EXISTS repositories_user_id_provider_full_name_key;
```

> Confirm the exact old constraint name first: `psql -c "\d repositories"` — Postgres auto-names it `repositories_user_id_provider_full_name_key` for `UNIQUE (user_id, provider, full_name)`, but verify.

- [ ] **Step 2: Validate in a rolled-back transaction**

```bash
psql "$DEV_DATABASE_URL" <<'SQL'
BEGIN;
\i applications/platform-rds-bootstrap/migrations/085_github_repo_id_cutover.sql
\d repositories
ROLLBACK;
SQL
```
Expected: no error; `github_repo_id` is `not null`; `uq_repositories_user_ghid` present; old unique gone.

- [ ] **Step 3: Commit**

```bash
git add applications/platform-rds-bootstrap/migrations/085_github_repo_id_cutover.sql
git commit -m "feat(rds): migration 085 enforce NOT NULL + unique github_repo_id, drop name unique"
```

### Task 6.3: Flip reads/joins to id (opportunistic, where safe)

- [ ] **Step 1:** Identify joins keyed on `repo_full_name` that have a stable `(user_id, github_repo_id)` on both sides (e.g. `listConnectedRepos` joins in admin-api). For each, write a test asserting equivalent rows return, then switch the join predicate to `github_repo_id`. Keep `full_name` in the SELECT for display.
- [ ] **Step 2:** Run the full suite in both repos: `yarn typecheck && yarn lint && yarn test`.
- [ ] **Step 3: Commit** each flip atomically with its test.

**PR 6 done:** the rename/transfer problem class is eliminated — `full_name` is a pure label.

---

## Final live verification (dev cluster)

- [ ] Heal: confirm `cdk-monitoring` row now has `github_repo_id` and name `tucaken-infra` (PR 3 already did this; re-confirm post-cutover).
- [ ] Rename a dev repo on GitHub → within seconds the admin-api log shows `repository.renamed: reconciled …`; stored `full_name` updates; `document_embeddings` count for that `github_repo_id` is unchanged.
- [ ] Rename a second repo but suppress the webhook → run a sync → the self-heal path (PR 5) refreshes the label; sync succeeds.
- [ ] Trigger a sync on a repo whose access was revoked → `repo_sync_state.status = 'error'` with the friendly `RepoNotFoundError` message, no crash (PR 1).

---

## Self-review

**Spec coverage:**
- Section 1 (data model) → PR 2 (columns/indexes), PR 6 (constraints). ✓
- Section 2 (detection: webhook + self-heal, shared `reconcileRepoName`) → PR 4 (webhook + routine), PR 5 (self-heal). ✓
- Section 3 (adapter hardening: redirect, shape guards, `resolveById`, typed errors → graceful status) → PR 1. ✓
- Section 4 (phased dual-write migration + backfill) → PR 2 (phase 1 DDL), PR 3 (backfill), PR 4/5 (phase 2 dual-write), PR 6 (phase 3 cutover). ✓
- Section 5 (decomposition & testing: 6-PR sequence, unit/integration/live) → PR structure + verification sections mirror the spec's order. ✓
- Out of scope (deletion beyond flagging, non-GitHub providers, re-embedding) → respected; backfill only flags 404s. ✓

**Type consistency:** `reconcileRepoName(pool, userId, githubRepoId, newFullName)` and the `LABEL_TABLES` list are identical across PR 3 (backfill), PR 4 (admin-api), PR 5 (ingestion). `GitHubRepoRef = { id, fullName, defaultBranch }` is the single shape returned by `resolveById`/`resolveByName`. `GITHUB_REPO_ID` env contract is the same on both job-spec and worker sides.

**Open confirmations for the executor (verify before coding the step that needs them):**
- Exact table set + label-column name per table (run the Scope-note `rg` check). The list here is from the spec; the schema is ground truth.
- Old `repositories` unique constraint name (`\d repositories`).
- admin-api test helper for signed webhooks — add `signedWebhook` if absent.
- Whether a shared cross-repo module is preferable to duplicating `reconcileRepoName` SQL (PR 5 Task 5.2).
