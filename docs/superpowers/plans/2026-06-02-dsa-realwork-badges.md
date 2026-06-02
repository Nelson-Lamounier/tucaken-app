# DSA Real-Work Badges (PR2 v1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Light Section B with 🟢/🟡/🔴 by joining JD calibration with `dsa_evidence` real-work signals, with narrow-coverage honesty.

**Architecture:** admin-api `GET /:slug` adds a user-scoped (RLS, `withUser`) aggregation over `dsa_evidence` → `dsaRealWork`; the Technical workspace joins it to `dsaTopicCalibration` on `canonicalName`.

**Tech Stack:** TypeScript, Hono (admin-api), React + TanStack, Vitest/Jest, pg.

**Spec:** `docs/superpowers/specs/2026-06-02-dsa-realwork-badges-design.md` (read it — has the full model + honesty constraints).

**Depends on:** ai-applications #116 (`dsa_evidence` + migrations 054/055). Stacked on `feat/dsa-support-ui` (#60 Section B).

---

## Task 1: admin-api — serve `dsaRealWork`

**Files:**
- Modify: `admin-api/src/routes/applications.ts` (the `GET /:slug` handler — add the aggregation near where `technicalRoundType` is resolved, and add `dsaRealWork` to the returned `application` object)
- Test: `admin-api/src/routes/applications.test.ts` (or the nearest existing GET /:slug test file — find it first)

- [ ] **Step 1 (read first):** Read the `GET /:slug` handler. Note: how `userId` is obtained, how `config` is obtained, and the `withUser(config, userId, fn)` helper in `admin-api/src/lib/pg.ts` (it does `SET LOCAL ROLE tucaken_app` + `SET LOCAL app.current_user_id`). The existing `technicalRoundType` query uses `db.query` (global table, no RLS); `dsa_evidence` IS RLS so it MUST go through `withUser`.

- [ ] **Step 2: Write the failing test** — `GET /:slug` returns `dsaRealWork` aggregated by topic; query failure → field omitted + 200. Mirror the existing GET /:slug test setup (fake pg). Assert an item has `{ canonicalName, matchCount, topConfidence, signals, samples }` and that on a thrown query the response still 200s without `dsaRealWork`.

- [ ] **Step 3: Implement.** After `technicalRoundType` is resolved, add (adapt identifiers to the real ones):

```typescript
// Real-work DSA evidence (RLS — user's own rows, all repos). Fail-open.
let dsaRealWork: Array<{
  canonicalName: string; matchCount: number; topConfidence: number;
  signals: string[]; samples: { repo: string; file: string; line: number }[];
}> | undefined;
try {
  dsaRealWork = await withUser(config, userId, async (client) => {
    const { rows } = await client.query<{
      dsa_topic: string; match_count: string; top_confidence: number;
      signals: string[]; samples: { repo: string; file: string; line: number }[];
    }>(
      `SELECT dsa_topic,
              COUNT(*)::int                 AS match_count,
              MAX(confidence)               AS top_confidence,
              ARRAY_AGG(DISTINCT signal)    AS signals,
              (ARRAY_AGG(
                 json_build_object('repo', repo_full_name, 'file', file_path, 'line', line_start)
                 ORDER BY confidence DESC))[1:3] AS samples
         FROM dsa_evidence
        GROUP BY dsa_topic`,
    );
    return rows.map((r) => ({
      canonicalName: r.dsa_topic,
      matchCount: Number(r.match_count),
      topConfidence: r.top_confidence,
      signals: r.signals ?? [],
      samples: r.samples ?? [],
    }));
  });
} catch (err) {
  console.error('[dsa] real-work aggregation failed (non-fatal)', (err as Error).message);
}
```
Then add `dsaRealWork,` to the returned `application` object (next to `technicalRoundType`).

Note: `dsa_evidence` query is RLS-scoped by `withUser` (no explicit `WHERE user_id` needed — the policy enforces it; the `current_setting` form in the spec is equivalent). Confirm whether the codebase prefers an explicit `WHERE user_id = $1` (some repos belt-and-braces it) — match local convention.

- [ ] **Step 4: Run tests** — find + run the admin-api test command (check `admin-api/package.json`; likely `npm test -w admin-api` or `npm --prefix admin-api test`). Green.
- [ ] **Step 5: Commit** — `feat(admin-api): serve dsaRealWork (dsa_evidence aggregated by topic, RLS)` (NO Co-Authored-By).

---

## Task 2: UI types

**Files:**
- Modify: `src/lib/types/applications.types.ts`

- [ ] **Step 1:** Add the type + field (place near `DsaTopicCalibration` / `technicalRoundType`):
```typescript
export interface DsaRealWorkTopic {
  readonly canonicalName: string;
  readonly matchCount: number;
  readonly topConfidence: number;
  readonly signals: string[];
  readonly samples: { repo: string; file: string; line: number }[];
}
// on ApplicationDetail:
  readonly dsaRealWork?: DsaRealWorkTopic[];
```
- [ ] **Step 2:** Typecheck (`npm run build` / `tsc --noEmit` per the UI package). Commit with Task 3 (types alone don't need their own commit) OR commit `feat(ui-types): DsaRealWorkTopic on ApplicationDetail`.

---

## Task 3: TechnicalWorkspace Section B — 🟢/🟡/🔴 merge

**Files:**
- Modify: `src/features/applications/stages/workspaces/TechnicalWorkspace.tsx`
- Test: `src/__tests__/features/applications/stage-components.test.tsx` (extend the existing Section B tests)

- [ ] **Step 1 (read first):** Read the current Section B render (around the `dsaCalibration.likelyTopics.map(...)` block) and its existing tests. Keep the v1 🔴 treatment intact for the no-evidence case.

- [ ] **Step 2: Write failing tests** (extend stage-components.test.tsx):
  - calibrated topic WITH matching `dsaRealWork` (same `canonicalName`) → renders the 🟢 treatment incl. a `repo/file:line` sample.
  - calibrated topic WITHOUT evidence → still the v1 🔴 "practice on LeetCode/NeetCode" text.
  - a `dsaRealWork` topic NOT in `likelyTopics` → appears in the "Other real-work DSA signals" block.
  - the narrow-coverage banner text is present whenever Section B renders.
  - no 🟢 sample text when `dsaRealWork` is empty/undefined.

- [ ] **Step 3: Implement.**
  - `const evidenceByTopic = new Map((detail.dsaRealWork ?? []).map(e => [e.canonicalName, e]))`.
  - In the `likelyTopics.map`: `const ev = evidenceByTopic.get(topic.canonicalName)`. If `ev` → render 🟢 card: a green badge, the phrase `Your ${ev.samples[0].repo}/${ev.samples[0].file}:${ev.samples[0].line} ${SIGNAL_PHRASE[ev.signals[0]] ?? 'shows real-work DSA'}` + `(in ${ev.matchCount} place${ev.matchCount>1?'s':''})` + the import-grounded caveat ("import/type-grounded — concrete work to talk to, not a mastery score"). Link the sample to its GitHub file if a URL is constructible (`https://github.com/${repo}/blob/HEAD/${file}#L${line}`). Else → existing 🔴 card.
  - After the primary list, render an "Other real-work DSA signals" block for evidence topics whose `canonicalName` ∉ `likelyTopics` (🟡, low-emphasis). Skip the block if none.
  - Add the **narrow-coverage banner** at the top of Section B (always when Section B shows): "Real-work detection covers a limited pattern set (graphs, heaps, trees/tries, memoization, custom sort). No green badge ≠ you can't do it — most DSA practice happens off-GitHub."
  - Add `const SIGNAL_PHRASE: Record<string,string> = { networkx_import: 'imports networkx (graph algorithms)', heap: 'uses a heap / priority queue', tree_type: 'defines a tree/trie type', memoization: 'uses memoization (@lru_cache/@cache)', comparator: 'uses a custom sort comparator' }`.
  - HONESTY: 🟢 strictly requires `ev`. Never render green from calibration alone.

- [ ] **Step 4: Run tests** green. Typecheck clean.
- [ ] **Step 5: Commit** — `feat(ui): Technical Section B real-work DSA badges (🟢/🟡/🔴 + narrow-coverage banner)` (NO Co-Authored-By).

---

## Final
- [ ] Full UI + admin-api suites green.
- [ ] Final code-reviewer over the branch (focus: no 🟢 without evidence; RLS on the evidence query; banner present; fail-open).
- [ ] superpowers:finishing-a-development-branch → PR (base `feat/dsa-support-ui`). PR body: depends on ai-applications #116; **gated on the #116 FP-audit ≤5% before production surfacing**; deploy order migrations 054/055 + tech-extractor before this.
