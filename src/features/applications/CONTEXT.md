# Application Stage Workspaces

The interview-prep surface inside the Application Detail view
(`src/features/applications`). An application moves through hiring stages; each
stage has a dedicated, glanceable prep **workspace**. This is not a chatbot — it
surfaces the user's own structured evidence at the moment they need it.

## Language

### Stages & navigation

**Interview Stage**:
One of the seven hiring steps — `applied | phone-screen | technical |
system-design | behavioural | bar-raiser | final`. The canonical type is
`InterviewStage` in `src/lib/types/applications.types.ts`.
_Avoid_: step, phase (**phase** = pipeline execution, see below).

**Current Stage**:
The application's actual `interviewStage` field — where it really is in the
process. Changed only by **Advance**.
_Avoid_: using "stage" alone when you mean the real one.

**Active Stage**:
The stage the user is currently *viewing*, held in the `?stage` search param.
Navigating between Active Stages does **not** change the Current Stage.
_Avoid_: selected stage, open stage.

**Stage Workspace**:
The self-contained prep surface rendered for the Active Stage. Seven of them,
sharing one shell, chrome, and "Mark complete and advance" action.
_Avoid_: tab, page, panel, screen.

**Advance**:
Mark the Current Stage complete and move `interviewStage` forward (a real
`updateApplicationStatusFn` PATCH). Always enabled — never blocked on completing
prep.
_Avoid_: complete, progress, next.

**Stage Progress Bar**:
The seven-segment navigator above the workspace. Segment states:
`completed | current | upcoming | skipped`.

### Evidence

**Evidence**:
A structured claim about the user's competency or fit, grounded in their indexed
work (projects, commits, ADRs) — **never raw LLM prose**.
_Avoid_: insight, suggestion, AI output.

**Evidence Indicator**:
The traffic-light strength of Evidence for a topic — `strong | moderate | none`,
rendered via the `good | warn | bad` semantic tones with a mandatory text label.
_Avoid_: score, rating (**Fit Rating** is a different scale).

**Evidence Card**:
A topic + its Evidence Indicator + **Project References** + honest guidance for
gap areas.

**Project Reference**:
A deep-link from a workspace into the user's existing Project case-study view
(`/projects/$id`). The topic→project linkage is backend-sourced (mocked in v1).
_Avoid_: portfolio link, source.

**Tradeoff**:
An architectural decision the user actually made, surfaced as a badge in System
Design (e.g. "RDS+pgvector over a dedicated vector DB"). Grounded in their work,
so they recognize their own reasoning.
_Avoid_: decision, choice (too generic).

### Stories

**Story**:
A user-authored STAR narrative (Situation, Task, Action, Result) tagged by
theme. v1 stories are authored by the user, not generated.

**Story Bank**:
The user's collection of Stories, filterable by theme
(`Conflict | Leadership | Failure | Ambiguity | Impact | Growth | Customer`).
Used in Behavioural and Bar Raiser.
_Avoid_: story library, examples.

### Offer (Final stage)

**Offer**:
The structured compensation components — base, bonus, equity, signing, other —
editable inline.

**Decision Factors**:
The user's weighted priorities (compensation, tech stack, growth, team,
location…) used to compute a personal-fit score against an **Offer**.
_Avoid_: preferences, criteria.

### Persistence & panel

**Stage Draft**:
The per-stage interactive state not yet backed by an API — notes, checklist
ticks, story selections, offer edits, decision weights. Persisted to
`localStorage` (`appstage:<slug>:<stage>`) in v1, behind one `useStageDraft`
hook with a single swap-point to a future `PATCH /stages/:stage`.
_Avoid_: saved state (it isn't server-saved yet).

**Notes & Timeline Panel**:
The persistent side panel (sticky on desktop, drawer on mobile). **Timeline** is
**derived Activity** (see the Knowledge Base glossary) from real timestamps plus
client-logged advance/note events; **Notes** are stage-tagged free text.
Panel open/closed state is persisted per user, not per application.

## Flagged ambiguities

- **Current Stage vs Active Stage** — the application's real `interviewStage`
  versus the stage being viewed (`?stage`). Navigation never advances the
  application; only **Advance** does.
- **Evidence Indicator vs Fit Rating** — Evidence Indicator is topic-level
  (`strong/moderate/none`); **Fit Rating** is application-level
  (`STRONG_FIT/REASONABLE_FIT/STRETCH/REACH`). Different scales — never conflate.
- **"Phase"** is reserved for pipeline execution (`ProgressBars`), never hiring
  stages.
- **"Coach"** is the existing agent that generates `InterviewPrepOutput`. After
  the absorb-and-retire, it is a *data source* feeding the Technical and
  Behavioural workspaces — no longer its own UI surface.

## Example dialogue

> **Dev:** The user clicked Technical — does that advance them?
> **Expert:** No. Clicking a segment changes the **Active Stage** via `?stage` —
> it's just navigation. The **Current Stage** is still whatever `interviewStage`
> says. Only the "Mark complete and advance" dropdown **Advances** them — the
> user picks the target stage from it (any of the seven), which sets the
> Current Stage.
> **Dev:** And the green dot on the "Distributed systems" card — that's the fit
> rating?
> **Expert:** No, that's an **Evidence Indicator** — `strong` for that topic,
> from the **Evidence** in their projects. **Fit Rating** is the whole
> application's STRONG_FIT/REACH scale. Different things.
> **Dev:** Where do the behavioural stories come from?
> **Expert:** The **Story Bank** — the user writes them. v1 keeps them in the
> **Stage Draft** in localStorage; there's no story backend yet.
