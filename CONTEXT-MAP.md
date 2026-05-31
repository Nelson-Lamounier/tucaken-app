# Context Map

This repo holds more than one bounded context. Each has its own glossary; this
map says where they live and how they relate.

## Contexts

- [Knowledge Base / Overview](./CONTEXT.md) — the agent's data-health dashboard
  (`src/features/user-home`): readiness scoring, profile intelligence, connected
  repositories, derived activity.
- [Application Stage Workspaces](./src/features/applications/CONTEXT.md) — the
  per-hiring-stage interview-prep surface inside the Application Detail view
  (`src/features/applications`): stage navigation, evidence, story bank, offer.

## Relationships

- **Knowledge Base → Stage Workspaces**: Evidence Cards and Project References in
  a Stage Workspace deep-link into the user's indexed work (the Project
  case-study view at `/projects/$id`) sourced from the Knowledge Base.
- **Shared language**: the **Activity (derived)** pattern — synthesizing a
  recent-events list from existing timestamps because there is no stored event
  log — is defined in the Knowledge Base glossary and reused by the Stage
  Workspaces' Notes & Timeline panel.
- **Shared design system**: both contexts use the dual-mode semantic tones in
  `src/components/ui/tone.ts` (teal `--accent`, light+dark) — never the
  applications feature's legacy dark-only palette.
