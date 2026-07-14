# lib/repositories

The SQL data-access layer — the **only** place SQL lives in admin-api. One
file per table or aggregate, each importing only `type Queryable` from
[`../pg.ts`](../pg.ts) so it runs identically against the pool, a client, or
an RLS-scoped transaction.

## Files

| File | Owns |
|---|---|
| `users.ts` | `users` — provisioning, plan status, soft/hard delete, plan/subscription mutators (M2M-only writers) |
| `applications.ts` | `job_applications` — list/detail/status/annotations |
| `interview-stages.ts` | Stage lifecycle, outcomes, scheduled interviews |
| `stage-feedback.ts` | Structured per-stage feedback |
| `funnel-analytics.ts` | Funnel computation over stages |
| `projects.ts` | `projects` + default-project bootstrap, merge/split, architecture, decisions |
| `project-references.ts` | Project-reference index + skill ranking |
| `resumes.ts` | `resumes` — CRUD, active selection, tailored-resume update |
| `career-history.ts` | Career entries |
| `articles.ts` | Articles + versions |
| `comments.ts` | Comment moderation |
| `pipeline-runs.ts` | `pipeline_runs` — dispatch ledger for every K8s Job |
| `bedrock-usage.ts` | LLM token usage + budgets |
| `tier-config.ts` | Tier-config row (Zod-validated via `../billing/tier-config-shape.ts`) |
| `webhook-events.ts` | Stripe webhook idempotency ledger |
| `user-rag.ts` | Knowledge Base health + derived activity reads |
| `prompt-observability.ts` | Prompt invocation records |

## Rules

- **Parameterised SQL only.** No string concatenation, ever.
- **`Queryable`, not `Pool`.** Take the narrowest interface; the caller
  decides pool vs RLS transaction (`withUser`).
- **No cross-layer imports.** Repositories may import `pg` types and sibling
  shapes (`billing/tier-config-shape`), never routes, jobs, or observability.
- **Plan/subscription mutators** in `users.ts` are write-restricted to the
  M2M internal-billing route — enforced by
  [`../__tests__/plan-write-isolation.test.ts`](../__tests__/plan-write-isolation.test.ts).
- RLS is the second line of user isolation; queries still filter by
  `user_id` explicitly.

## Testing

`__tests__/` beside this file — repository tests mock nothing but the
`Queryable` and assert exact SQL shapes (e.g. decision updates scoped by both
project and decision id).

## Related

- [lib overview](../README.md) · [`../pg.ts`](../pg.ts) · migrations in the platform-rds-bootstrap repo
