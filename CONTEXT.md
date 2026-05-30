# tucaken-app

A TanStack Start application that builds and maintains an AI career agent for a
user. This glossary covers the **Knowledge Base / Overview dashboard** domain
(`src/features/user-home`) — the surface that shows the agent's data health.

## Language

### Knowledge Base & readiness

**Knowledge Base**:
The aggregate of a user's career data the AI agent draws on — connected
repositories, résumé imports, and career entries combined.
_Avoid_: KB (in prose), dataset, corpus.

**Agent Readiness Score**:
A 0–100 measure of whether the Knowledge Base holds enough quality data for the
agent to work well. Rendered by the readiness gauge.
_Avoid_: Health score, completeness.

**Readiness Signal**:
A single weighted factor that contributes to the **Agent Readiness Score** (e.g.
résumé coverage, repo quality). A breakdown of _why_ the score is what it is.
_Avoid_: Metric, check. **Not** a setup step.

**Setup Checklist**:
Onboarding steps a user completes to populate the Knowledge Base (connect a repo,
upload a résumé, run the agent). Each step's done-state is **derived from stats**,
not stored. Distinct from **Readiness Signals** — a checklist tells you what to
_do next_; a signal tells you what's _weak_.
_Avoid_: Tasks, to-dos.

### Profile Intelligence

**Profile Intelligence**:
The tabbed panel presenting the agent's interpretation of the user, composed of
the Mirror, Direction, and Reconciliation reads over a shared **Diagnostic**.
_Avoid_: Insights panel, analysis.

**Profile Mirror**:
What the indexed data reflects back about the user as they are now.

**Career Direction**:
Where the data suggests the user is heading next.

**Résumé Reconciliation**:
The gaps between a user's résumé and the data indexed into the Knowledge Base.
_Avoid_: Diff, comparison.

**Diagnostic**:
The underlying scored analysis (`DiagnosticJson`) that feeds the Readiness Score
and the Profile Intelligence reads.

### Repositories & rail

**Connected Repository**:
A GitHub repo indexed into the Knowledge Base. Carries a **classification**
(`project | stale | fork | noise | abandoned | tutorial`) and a quality
**score** (0–1).
_Avoid_: Linked repo, source.

**Full Review**:
The detailed per-repository read, opened from a repo card's "Full review" button
into a slide-over (`DashboardDrawer`). The card itself is a compact preview; the
Full Review is the drill-down. This is load-bearing and **must survive any
restyle** — the reference mockup's static card has no equivalent.
_Avoid_: Details, expand.

**Health Rail**:
The dashboard's aside column holding the **Setup Checklist**, career breakdown,
résumé files, and **Activity**.
_Avoid_: Sidebar (overloaded with app nav).

**Hero Stats**:
The top-band KPI tiles (connected repositories, career entries, résumé uploads,
Knowledge Base status).
_Avoid_: Metrics, summary cards.

**Activity** (derived):
A recent-events list **synthesized from existing timestamps** (résumé imports,
repo syncs, career updates) — there is no stored event log.
_Avoid_: Audit log, event feed (implies real persistence).

## Flagged ambiguities

- **"Readiness"** splits into two distinct concepts: the **Agent Readiness
  Score** (a number) and its **Readiness Signals** (the weighted breakdown). The
  **Setup Checklist** is a third, separate thing — onboarding steps, not signals.
- **"Accent"** in this app means the brand **teal**, exposed as the `--accent`
  theme token. The reference mockup's orange is not the accent.

## Example dialogue

> **Dev:** The readiness panel is at 48 — is that the checklist?
> **Expert:** No. 48 is the **Agent Readiness Score**. The panel below it lists
> the **Readiness Signals** — résumé coverage is dragging it down. The
> **Setup Checklist** is separate, over in the **Health Rail**; it just tells the
> user to upload a résumé. One's a diagnosis, the other's a next-step.
> **Dev:** And the activity list next to it — is that real events?
> **Expert:** It's **derived Activity**. We don't store an event log; we
> synthesize it from import and sync timestamps we already have.
