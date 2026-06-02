# DSA Real-Work Badges (PR2 of v1.5) — Design

> **Date:** 2026-06-02
> **Status:** Approved design. Plan next.
> **Goal:** Light the Technical workspace Section B with 🟢/🟡/🔴 — merging JD calibration
> (what the role tests) with real-work `dsa_evidence` (what the candidate's code shows), with
> narrow-coverage honesty so an absent badge never reads as "you can't do this".
> **Repo:** `tucaken-app` (admin-api serve + UI). **Consumes:** ai-applications PR #116
> (`dsa_evidence` lane + detector). **Builds on:** DSA v1 PR #60 (Section B, calibration-only).
> **Gated on:** the #116 FP-audit passing ≤5% before this surfaces in production.

## The model

For each topic, the badge is the join of two facts:

| | JD-calibrated (in `dsaTopicCalibration`) | NOT calibrated |
|---|---|---|
| **Has `dsa_evidence`** | 🟢 role tests it AND your code shows it | 🟡 real-work signal, role didn't ask |
| **No evidence** | 🔴 role tests it → practice externally | (not shown) |

- 🟢 / 🔴 render in the primary list (the JD-calibrated topics, already in Section B).
- 🟡 render in a secondary "Other real-work DSA signals" block (informational, collapsed/low-emphasis).
- Topics neither calibrated nor evidenced are not shown.

## Honesty constraints (carry from v1.5)

1. **🟢 only with real evidence.** A green badge requires ≥1 `dsa_evidence` row whose `dsa_topic`
   equals the calibrated topic's `canonicalName`. Never synthesized.
2. **🟢 copy is import-grounded, not mastery.** e.g. *"Your `repo/graph.py:42` imports networkx —
   concrete graph-algorithm work you can talk to."* NEVER "you've mastered graphs." The detector
   confidence (0.70–0.80) means "you authored this construct," not "semantic proof of skill."
3. **Narrow-coverage banner (mandatory).** Real-work detection covers a *limited* pattern set
   (graph/heap/tree/trie/memoization/sort). Absence of 🟢 ≠ absence of skill — Section B must say
   so. Most topics legitimately have no real-work signal because DSA rarely lives in production code.
4. **🔴 unchanged** from v1 — "Not assessed from your code → practice on LeetCode/NeetCode."

## Components

### A. admin-api — serve `dsaRealWork` (`admin-api/src/routes/applications.ts`, `GET /:slug`)
Query `dsa_evidence` user-scoped via `withUser(config, userId, …)` (RLS), aggregated by topic
**across all the user's repos** (DSA ability is general, not app-specific):
```sql
SELECT dsa_topic,
       COUNT(*)                              AS match_count,
       MAX(confidence)                       AS top_confidence,
       ARRAY_AGG(DISTINCT signal)            AS signals,
       (ARRAY_AGG(json_build_object('repo', repo_full_name, 'file', file_path, 'line', line_start)
                  ORDER BY confidence DESC))[1:3] AS samples
  FROM dsa_evidence
 WHERE user_id = current_setting('app.current_user_id')::uuid
 GROUP BY dsa_topic;
```
Shape served on `ApplicationDetail.dsaRealWork`:
```typescript
readonly dsaRealWork?: ReadonlyArray<{
  readonly canonicalName: string;   // = dsa_evidence.dsa_topic, joins to calibration
  readonly matchCount: number;
  readonly topConfidence: number;
  readonly signals: string[];       // e.g. ['networkx_import']
  readonly samples: { repo: string; file: string; line: number }[];  // ≤3, highest-confidence
}>;
```
Fail-open: a query error → `dsaRealWork` omitted (Section B falls back to v1 calibration-only).
Empty for users with no GitHub / no detected patterns.

### B. UI types (`src/lib/types/applications.types.ts`)
Add `DsaRealWorkTopic` + `ApplicationDetail.dsaRealWork`.

### C. TechnicalWorkspace Section B (`src/features/applications/stages/workspaces/TechnicalWorkspace.tsx`)
- Build `evidenceByTopic = new Map(dsaRealWork.map(e => [e.canonicalName, e]))`.
- Primary list (existing calibrated topics): for each `likelyTopics[i]`, look up
  `evidenceByTopic.get(topic.canonicalName)`:
  - **found → 🟢 card:** badge + "Your `{sample.repo}/{sample.file}:{sample.line}` {signal-phrase}"
    + `matchCount` ("in N place(s)") + the import-grounded caveat. Link to the GitHub file.
  - **not found → 🔴 card:** the existing v1 "practice externally" treatment (unchanged).
- Secondary block "Other real-work DSA signals" (🟡): evidence topics whose `canonicalName` is NOT
  in `likelyTopics` — low-emphasis, "your code shows this; this role didn't emphasize it."
- **Narrow-coverage banner** at the top of Section B (always shown when Section B shows): the
  honesty note from constraint #3.
- `honestyNote` footnote (existing) retained.

`signal-phrase` map (honest, specific): `networkx_import`→"imports networkx (graph algorithms)";
`heap`→"uses a heap / priority queue"; `tree_type`→"defines a tree/trie type";
`memoization`→"uses memoization (@lru_cache/@cache)"; `comparator`→"uses a custom sort comparator".

## Data flow
```
ai-applications run-tech-extract → dsa_evidence (per user, all repos)   [#116]
tucaken admin-api GET /:slug:
  research.dsaTopicCalibration  (JD topics — app-specific)   [#60]
  + dsaRealWork (dsa_evidence aggregated by topic — user-global)   [this PR]
TechnicalWorkspace Section B:
  join on canonicalName → 🟢 (calibrated+evidence) / 🔴 (calibrated, none) / 🟡 (evidence, extra)
  + narrow-coverage banner
```

## Error handling & honesty guardrails
- `dsaRealWork` query failure → omitted → v1 calibration-only Section B (no crash, no fake green).
- 🟢 strictly requires a matching evidence row; the join key is `canonicalName`/`dsa_topic` (both
  the seeded `dsa_topics.canonical_name`).
- Confidence shown as the import-grounded caveat, never as a mastery score.
- RLS: evidence read only via `withUser` (user's own rows).

## Testing
- **A (admin-api):** `GET /:slug` returns `dsaRealWork` aggregated by topic (fake pg); query is
  user-scoped (`withUser`); query failure → field omitted, 200 OK.
- **C (UI):** calibrated topic WITH matching evidence → 🟢 + sample file:line; calibrated WITHOUT →
  🔴 (v1 treatment); evidence topic not calibrated → 🟡 secondary block; banner always present when
  Section B renders; **no 🟢 without an evidence row**; `take-home`/`system-design` round → Section B
  still gated as v1.

## Decomposition (single PR, 2 commits)
- **admin-api:** `dsaRealWork` aggregation + serve + types + tests.
- **UI:** Section B 🟢/🟡/🔴 merge + banner + signal-phrase map + tests.

## Out of scope
- Per-repo evidence drill-down UI; DSA-tagged STAR stories; lighting 🟢 for topics outside the 5
  detector signals (no honest signal exists). All deferred.
