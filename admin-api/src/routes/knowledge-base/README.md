# knowledge-base

Read models over the user's **Knowledge Base** — the aggregate of connected
repositories, resume imports and career entries the Tucaken agent draws on.
Nothing here writes; these endpoints power the Overview dashboard's health
and activity surfaces.

## Files

| File | Exports | Mount | Purpose |
|---|---|---|---|
| `kb.ts` | `createKbRouter` | `/api/admin/kb` | Knowledge Base health check |
| `activity.ts` | `createActivityRouter` | `/api/admin/activity` | Derived activity feed + KB health summary |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/kb/health` | Knowledge Base data-health snapshot |
| GET | `/api/admin/activity/daily` | Recent activity, synthesised from existing timestamps |
| GET | `/api/admin/activity/kb-health` | KB health summary for the Health Rail |

## Design notes

- **Activity is derived, not stored.** There is no event log — the feed is
  synthesised from resume-import, repo-sync and career-update timestamps via
  `lib/repositories/user-rag.ts`. Do not add an events table casually; that is
  a product decision.
- Vocabulary follows the project glossary (`CONTEXT.md`): Knowledge Base,
  Readiness Signals, Health Rail — keep response field names consistent with it.

## Testing

Covered through repository tests (`lib/repositories/__tests__/user-rag.test.ts`).

## Related

- [routes overview](../README.md) · [lib/repositories](../../lib/repositories/README.md) · `CONTEXT.md` (repo root)
