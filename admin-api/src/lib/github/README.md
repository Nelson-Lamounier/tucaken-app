# lib/github

GitHub App domain services — everything that talks to GitHub or maintains the
DB shadow of GitHub state, shared by the github routes, admin tooling and
operator scripts.

## Files

| File | Purpose | Key exports |
|---|---|---|
| `github-app.ts` | GitHub App auth: App JWT, 1-hour installation tokens, repo/installation listing, head-SHA resolution (raw Node https, no SDK) | `generateInstallationToken`, `getInstallationInfo`, `listInstallationRepos`, `deleteInstallation`, `resolveHeadSha` |
| `connection.ts` | Cascade teardown of a user's GitHub footprint (embeddings → sync state → repositories → oauth_connections) | `deleteConnection` |
| `github-uninstall.ts` | Best-effort revoke of the App installation on GitHub's side (DB teardown always wins) | `revokeGitHubInstallationForUser` |
| `reconcile-repo-name.ts` | Idempotently heal denormalised `repo_full_name` copies after rename/transfer, keyed on immutable `github_repo_id` | `reconcileRepoName` |
| `sync-state.ts` | Ingestion dedup guards shared by all dispatch call sites | `isSyncInFlight`, `tryClaimSyncSlot` |
| `sbom.ts` | CycloneDX 1.6 SBOM builder over `technology_evidence` rows | `bomFromEvidenceRows` |
| `croissant.ts` | MLCommons Croissant data-card builder (RAG counterpart to the SBOM) | `croissantFromAggregate` |

## Design notes

- **Token model:** no PAT is ever persisted; only `installation_id`.
  Everything else is minted on demand and expires within an hour.
- `sbom.ts` and `croissant.ts` are self-contained ports of `@bedrock/shared`
  logic (ai-applications repo) — keep them dependency-free so admin-api does
  not grow a build-time coupling to the worker workspace.
- `deleteConnection` deletes in FK-safe order; if you add a new table keyed by
  repo or connection, extend the cascade **and** its tests.

## Consumers

`routes/github/*`, `routes/admin/admin-users.ts`, `routes/account/me.ts`,
`scripts/reconcile-github-installations.ts`, `lib/account/purge-user.ts`.

## Testing

`__tests__/`: `croissant.test.ts`, `sbom.test.ts`, `reconcile-repo-name.test.ts`.

## Related

- [lib overview](../README.md) · [routes/github](../../routes/github/README.md)
