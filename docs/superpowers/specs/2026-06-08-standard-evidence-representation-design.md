# Standard evidence representation across Applied / Phone Screen / Technical

**Date:** 2026-06-08
**Repos:** `tucaken-app` (frontend + admin-api), `ai-applications` (Coach Agent)
**Status:** Design approved — pending implementation plan

## Problem

The same underlying evidence — the Research Agent's `verifiedMatches` (plus
`partialMatches` / `gaps`) — surfaces in three interview stages with three
*different* card implementations, and the Phone Screen's Coach-authored talking
points can drift from that evidence:

- **Applied** → bespoke `VerifiedMatchCard` (`AppliedWorkspace.tsx`).
- **Technical** → strength-icon flip card `TopicsPanel` (`TechnicalWorkspace.tsx`),
  built on the canonical `EvidenceTopic` model via `researchToTopics`.
- **Phone Screen** → `TalkingPointsPanel` (`PhoneScreenWorkspace.tsx`), driven by
  the Coach's `jdTalkingPoints` with a fallback to `verifiedMatches`.

Lineage (verified, not guessed):
- `verifiedMatches` is defined **once** — `StrategistResearchResult` (Research
  Agent). `InterviewCoachResult` carries **no copy** of it.
- `research` is stored in `pipeline_runs.metadata.research` and returned **once**
  as `detail.research`; coaching is `coaching_content.topics_to_study` returned as
  `detail.coaching[stage].topics`.
- So Applied + Technical are two UI lenses on one object (no token/storage
  duplication). The only second representation is the Coach's `jdTalkingPoints`,
  which today is **not linked** to specific verified matches → can contradict.

## Goals

1. One **standard visual language + data root** for this evidence across the three
   stages, with a **stage-tuned lens** each.
2. The Coach's Phone Screen talking points are **grounded** in `verifiedMatches`
   (one-to-many) so they can never contradict the research.

Non-goals: changing the Research Agent; restructuring storage; touching stages
other than Applied / Phone Screen / Technical.

## Decisions (locked with the user)

- **Standardization model:** shared component + data model, stage-tuned lens.
- **Coach behavior:** keep the curated talking points, but **ground** them to
  specific verified matches.
- **Mapping cardinality:** one-to-many — a talking point cites one or more
  verified-match skills (`matchedSkills: string[]`); every entry must be a real
  `verifiedMatches[].skill`.

## Architecture

### 1. Single source of truth + shared primitive

- Source stays the **Research Agent**. `research.verifiedMatches / partialMatches
  / gaps` → `EvidenceTopic[]` via the existing `researchToTopics(research)`
  (`stages/types/workspace.ts`). No new generation; the Coach never copies it.
- New shared primitive **`EvidenceDeck`** (+ `EvidenceFlipCard`), extracted from
  the current Technical `TopicsPanel` card: strength-icon front, evidence-on-back
  flip, `rounded-md`, accent tokens, `role="img"` + `aria-label` on the icon
  (signal not colour-only). The bespoke `VerifiedMatchCard` is retired in favour
  of it.
- Location: `stages/components/EvidenceDeck.tsx` (new), consumed by all three
  workspaces.

### 2. Per-stage lenses (same deck, different slice)

| Stage | Lens / label | Item set | Card back |
|---|---|---|---|
| **Applied** | "Verified matches" — *proof you fit* | `strength === 'strong'` (verified) | sourceCitation / depth / recency |
| **Technical** | "Topics likely to come up" — *what to revise* | all (verified/partial/gaps) with strength | summary + `beHonest` |
| **Phone Screen** | "Talking points to lead with" — *what to say* | Coach `jdTalkingPoints` (grounded) | `evidence` + `matchedSkills` chips |

Phone Screen **fallback**: when the Coach produced no talking points, derive cards
from `verifiedMatches` (skill as the point) so the panel never empties.

Applied keeps `partialMatches` / `gaps` summarized in the glance tiles (today's
behavior); the deck stays focused on verified *proof*.

### 3. Coach contract + grounding (ai-applications)

- **Contract:** `PhoneScreenTalkingPoint` gains `matchedSkills: string[]` across
  `@bedrock/shared` `strategist-types.ts`, the Coach tool schema + Zod
  (`coach-agent.ts`), and the frontend mirror (`applications.types.ts`):
  ```ts
  { point: string; evidence: string; matchedSkills: string[] }
  ```
- **Prompt** (`prompts/coach/stages/phone-screen.ts`): build each talking point
  from one or more **verified** matches; list every skill it draws on in
  `matchedSkills`; never cite a skill absent from the verified matches.
- **Grounding guard** (fail-closed, mirrors the existing `skillTransfer`
  validation in `executeCoachAgent`): after parse, intersect each talking point's
  `matchedSkills` with `research.verifiedMatches[].skill`. Drop unverified skills;
  drop the talking point if none remain. Guarantees no contradiction reaches the
  DB or UI.

### 4. Backward compatibility

`matchedSkills` is **optional** end to end. Old rows (`{ point, evidence }`)
render without chips; the frontend works before and after the Coach redeploys, so
the two repos are **not deploy-coupled**. The UI ships first safely.

## Files (anticipated)

**tucaken-app**
- `stages/components/EvidenceDeck.tsx` (new shared primitive)
- `stages/workspaces/AppliedWorkspace.tsx` (retire `VerifiedMatchCard`, use deck)
- `stages/workspaces/TechnicalWorkspace.tsx` (use shared deck)
- `stages/workspaces/PhoneScreenWorkspace.tsx` (talking points via deck + `matchedSkills` chips + fallback)
- `lib/types/applications.types.ts` (`PhoneScreenTalkingPoint.matchedSkills?`)
- tests for deck + lenses + fallback

**ai-applications**
- `applications/shared/src/strategist-types.ts` (+ index export)
- `applications/job-strategist/src/agents/coach-agent.ts` (tool schema + Zod + grounding guard)
- `applications/job-strategist/src/prompts/coach/stages/phone-screen.ts`
- eval fixtures (`phone-screen.json`) + tests

## Testing

- Grounding guard: drops unverified `matchedSkills`, drops empty talking points.
- `EvidenceDeck`: renders each lens; strength icon a11y; Phone fallback path.
- Full `typecheck` / `lint` / `test` / `build` in both repos; `@bedrock/shared`
  rebuilt; fixtures refreshed.

## Rollout

UI is backward-compatible → ship `tucaken-app` first. Coach change requires a
pipeline redeploy to populate `matchedSkills`; until then chips are absent and the
fallback covers empty talking points. No DB migration (JSON columns).
