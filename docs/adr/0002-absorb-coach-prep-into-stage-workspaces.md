# Absorb the Coach interview-prep surface into the stage-workspace shell

The repo already had a Coach-Agent prep surface: `InterviewPrepOutput` on
`ApplicationDetail`, the `ApplicationInterviewPrep` component, and a standalone
`/applications/interview-prep` hub route. Rather than build the new seven-stage
workspaces as a parallel system (the literal reading of the build brief, which
never mentioned the Coach), we **absorb** it: the new stage-workspace shell
inside `/applications/$slug` becomes the single interview surface, the Coach
`InterviewPrepOutput` becomes the data source feeding the Technical and
Behavioural workspaces, and the standalone hub route plus the dark-only
`ApplicationInterviewPrep` component are **retired**.

We chose this over the parallel build because two coexisting prep systems would
duplicate the domain, double the maintenance, and leave the ADR-0001-violating
dark-only component in place. A future reader who finds the `interview-prep`
route gone and the Coach demoted from "its own screen" to "a data source" should
read that as deliberate, not a deletion accident.

Trade-off: it couples the new shell to the existing Coach output shape (an
adapter, see ADR-0003) and means there is a window during the staged rollout
where the shell is live but some stages render honest "prep not generated yet"
states rather than the old hub.

## Considered Options

- **Absorb + retire** (chosen) — one surface, one data shape.
- **Build parallel, ignore old** — fastest start, but two interview-prep systems
  and the dark-only component linger.
- **Wrap old, extend later** — re-skin `InterviewPrepOutput` only, defer the
  ownership question. Rejected as it postpones the duplication problem without
  solving it.
