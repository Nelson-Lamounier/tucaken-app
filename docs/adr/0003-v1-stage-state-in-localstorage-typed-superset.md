# v1 stage state lives in localStorage behind a typed superset, not stubbed endpoints

The stage workspaces need far more structured data than any backend provides
today: only the Coach Agent's `InterviewPrepOutput` (questions, checklist,
questions-to-ask, prose notes) and the application's `interviewStage` /status
mutations are real. Evidence Cards, Project References, STAR stories, System
Design tradeoff badges, comp/offer data, and all per-stage interactive
state (notes, checklist ticks, story selections, offer edits, decision weights)
have no API.

We decided **not** to scaffold throwaway `createServerFn` stubs for the missing
endpoints. Instead: define the full `StageWorkspaceData` TypeScript shape now as
the contract; an adapter maps the real `InterviewPrepOutput` onto the fields it
can fill; everything else is typed + mock-fed and marked `// BACKEND:
follow-on`. All not-yet-backed *write* state persists to `localStorage` keyed
`appstage:<slug>:<stage>` behind a single `useStageDraft` hook, whose one
swap-point becomes a real `PATCH /stages/:stage` when the backend lands.
**Advance** and **prep generation** wire to the existing real mutations
(`updateApplicationStatusFn`, `useApplicationCoach`).

We chose this over fake server stubs because stubs invent success states with
nothing behind them and become dead code; and over in-memory-only state because
the brief promises notes "persist", and auto-save that vanishes on refresh is
misleading. A future reader who finds interview notes in the browser's
localStorage and a half-mocked `StageWorkspaceData` type should read this as a
deliberate v1 boundary, not an unfinished integration.

Trade-off: drafts are per-browser, not synced across devices, and the
superset type carries fields with no backing data until the follow-on work —
each is flagged in code so the gap is visible, not silent.
