# Parse coaching notes into sections client-side, pending structured coach output

> **Update (durable fix landed):** the Coach Agent now emits `coachingNotes` as a
> structured object — see `@bedrock/shared` `CoachingNotes` and the
> `emit_interview_coaching` tool schema in job-strategist's `coach-agent.ts`. The
> frontend type `InterviewPrepOutput.coachingNotes` is now `string | CoachingNotes`,
> and `coaching-sections.ts` is the thin adapter this ADR predicted:
> `fromStructured` maps the object straight through; the markdown-header parser is
> retained only for legacy rows. CDATA is no longer emitted (the prompt forbids it;
> `deepStripCdata` stays as a defensive net). The body below is the original
> decision, kept for history.

The Coach Agent (an upstream Bedrock pipeline, not this repo) returns
`InterviewPrepOutput.coachingNotes` as a **single markdown blob**. Two artefacts
of that pipeline leak into the string:

1. An XML **`<![CDATA[ … ]]>` wrapper** — the coach is prompted with an XML
   template and the wrapper survives extraction.
2. Internal structure encoded only as **bold ALL-CAPS headers**
   (`**STAGE POSITIONING…**`, `**TACTICAL PREPARATION…**`, `**COMMUNICATION
   STRATEGY…**`, `**MINDSET FOR THIS ROUND…**`, `**POST-INTERVIEW DEBRIEF…**`,
   `**FINAL CHECKPOINT…**`), plus an inline `The interview will focus on:`
   paragraph.

The Technical and Phone-Screen pages want those parts in different regions:
positioning above the dashboards, interview-focus inside the "What to expect"
panel, and the remaining sections as their own collapsible groups. So we
**parse the blob on the client** (`stages/lib/coaching-sections.ts`): strip the
CDATA wrapper, split on the known headers, and pull the interview-focus items
out. Rendering is via `react-markdown` + `remark-gfm` in a `prose` container,
which escapes raw HTML — safe for LLM output.

Parsing is **best-effort with a graceful fallback**: when none of the known
headers are found (older notes, a different coach template, or a stage whose
notes are shaped differently), `structured` is `false` and the whole blob renders
in one "Coaching notes" panel. No content is ever dropped.

We chose client-side parsing because it required **no upstream change** and
unblocks the UI now. The cost is fragility: the parser is coupled to the coach's
exact header vocabulary. If the Bedrock pipeline renames a section, that section
silently falls back into the single panel rather than its dedicated region — a
soft failure, but a real coupling.

**The durable fix is upstream.** The Coach Agent should emit
`coachingNotes` as **structured fields** — `{ positioning, interviewFocus[],
tacticalPrep, communication, mindset, debrief, finalCheckpoint }` — and should
not wrap output in CDATA. When that lands, `coaching-sections.ts` collapses to a
thin adapter (or disappears) and the header-matching brittleness goes away. Until
then, treat the client parser as a compatibility shim, not the contract.

## Considered Options

- **Client-side parse + graceful fallback** (chosen) — ships now, no backend
  dependency, never loses content; brittle to header renames.
- **Render the raw blob as one markdown panel** — what we had; correct but
  ignores the explicit request to distribute sections across the page.
- **Block on structured coach output** — the right end state, but it stalls the
  UI work behind an upstream pipeline change we don't own.
