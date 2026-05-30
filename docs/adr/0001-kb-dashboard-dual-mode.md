# KB dashboard keeps light+dark, not the mockup's dark-only look

The `user-home/src` reference design for the Knowledge Base / Overview dashboard
is dark-only (hardcoded `bg-zinc-950`, white-opacity surfaces, no `dark:`
variants). We are migrating production to that visual style **but retaining the
app's light+dark contract** via next-themes — every migrated panel gets `dark:`
variants and a light fallback.

We chose this over committing to dark-only because CLAUDE.md mandates that any
component render correctly in both modes, and the dashboard sits inside
`DashboardPage` alongside other dual-mode surfaces; a single dark-only island
would be jarring and would force a documented exception to a global rule.

Trade-off: more styling work than porting the mockup verbatim, and the dark
mode loses none of the mockup's punch while light mode is a deliberate
re-tokenization (teal `--accent`, zinc light surfaces) rather than the
mockup's exact palette.

A future reader seeing `dark:`-laden panels that clearly originated from a
dark-only design should read this as intentional, not half-finished.
