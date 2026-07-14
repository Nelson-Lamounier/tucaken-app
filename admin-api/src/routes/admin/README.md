# admin (staff tooling)

Operator support surface — user administration, owner settings, and
operator-visibility reads. Everything here is locked behind the `admin`
Cognito group (`requireAdminGroup()` in [`src/index.ts`](../../index.ts)),
except the prompt-feedback capture POST which any signed-in user may call.

## Files

| File | Exports | Mount | Purpose |
|---|---|---|---|
| `admin-users.ts` | `createAdminUsersRouter` | `/api/admin/users` | Support tool: inspect, patch, delete, restore, purge users |
| `admin-settings.ts` | `createAdminSettingsRouter` | `/api/admin/settings` | Owner-scoped chatbot feature flag |
| `role-ontology.ts` | `createRoleOntologyRouter` | `/api/admin/role-ontology` | Read-only view of the role-ontology auto-training loop |
| `prompt-feedback.ts` | `createPromptFeedbackRouter` | `/api/admin/prompt-feedback` | Prompt feedback capture + stats |

## Endpoints

| Method | Path | Staff | Purpose |
|---|---|---|---|
| GET | `/users` | yes | List users |
| GET | `/users/:userId` | yes | User detail |
| PATCH | `/users/:userId` | yes | Update role/flags |
| DELETE | `/users/:userId` | yes | Soft-delete a user |
| POST | `/users/:userId/restore` | yes | Restore a soft-deleted user |
| DELETE | `/users/:userId/github` | yes | Tear down the user's GitHub connection |
| GET | `/users/:userId/repositories` | yes | User's Connected Repositories |
| GET | `/users/:userId/repositories/:repo` | yes | Single repository detail |
| GET | `/users/:userId/diagnostic` | yes | Knowledge Base diagnostic for support |
| GET/PATCH | `/settings/chatbot` | yes | Owner chatbot flag (admin-managed, owner-applied) |
| GET | `/role-ontology/candidates` | yes | Auto-training candidate queue |
| POST | `/prompt-feedback` | no | Capture prompt feedback from any user |
| GET | `/prompt-feedback/stats` | yes | Aggregated feedback stats |

## Design notes

- GitHub teardown calls [`lib/github/connection.ts`](../../lib/github/README.md)
  `deleteConnection` plus `lib/github/github-uninstall.ts` to revoke the App
  installation on GitHub's side — best-effort, DB teardown always wins.
- Hard delete ("purge now") delegates to
  [`lib/account/purge-user.ts`](../../lib/account/README.md), the single
  source of truth shared with the nightly account-sweep script.
- **Never rely on hidden UI as access control** — every handler re-checks the
  admin group server-side via the mounted middleware.

## Testing

`__tests__/admin-users.list.test.ts`, `admin-users.patch.test.ts`,
`admin-users-delete.test.ts`, `admin-users-github.test.ts`,
`admin-settings.test.ts`, `role-ontology.test.ts`, `prompt-feedback.test.ts`.

## Related

- [routes overview](../README.md) · [lib/account](../../lib/account/README.md) · [lib/github](../../lib/github/README.md)
