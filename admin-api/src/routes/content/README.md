# content

Portfolio content authoring: articles, comment moderation, drafts and media
assets. Staff-gated except `drafts` (articles, comments and assets carry
`requireAdminGroup()` in [`src/index.ts`](../../index.ts)).

## Files

| File | Exports | Mount | Staff | Purpose |
|---|---|---|---|---|
| `articles.ts` | `createArticlesRouter` | `/api/admin/articles` | yes | Article CRUD, publish, versions, topic candidates |
| `comments.ts` | `createCommentsRouter` | `/api/admin/comments` | yes | Comment moderation queue |
| `drafts.ts` | `createDraftsRouter` | `/api/admin/drafts` | no | Draft content in the assets bucket |
| `assets.ts` | `createAssetsRouter` | `/api/admin/assets` | yes | S3 asset presign + delete |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/articles` | List articles |
| POST | `/articles` | Create |
| GET | `/articles/:slug` | Read |
| PUT | `/articles/:slug` | Update |
| DELETE | `/articles/:slug` | Delete |
| POST | `/articles/:slug/publish` | Publish (sets status + destinations) |
| GET | `/articles/:slug/versions` | Version history |
| GET | `/articles/slug-available` | Slug availability check |
| GET | `/articles/topic-candidates` | Topic-discovery candidates for the admin dropdown |
| GET | `/comments/pending` | Moderation queue |
| POST | `/comments/:id/moderate` | Approve/reject |
| DELETE | `/comments/:id` | Remove |
| POST | `/drafts/:slug` | Store a draft blob |
| POST | `/assets/presign` | Presigned upload URL (canonical key allowlist) |
| DELETE | `/assets/:key` | Delete an asset |

## Design notes

- **Publishing does not auto-revalidate the portfolio.** The portfolio site
  reads published articles via public-api with ISR (up to 1 h lag);
  `lib/portfolio-revalidate.ts` is a best-effort hook, and a manual purge via
  the in-pod `/api/revalidate` endpoint remains the deterministic path.
- Articles are served to the portfolio only when `status='published'` **and**
  `destinations @> {portfolio}` — the destinations array is the routing
  contract with public-api.
- Asset presign enforces a **canonical key allowlist** — never accept a raw
  client-supplied S3 key shape.
- Article content is MDX-sensitive: `{#anchor}` heading suffixes and other
  acorn-breaking syntax must stay out of `content_md` (the portfolio renderer
  sanitises, but do not rely on it).

## Testing

`__tests__/articles.test.ts`, `articles.owner-scope.test.ts` (owner scoping),
`comments.test.ts`, `assets.test.ts`, `assets.presign.test.ts`.

## Related

- [routes overview](../README.md) · [lib/repositories](../../lib/repositories/README.md)
- KB: article pipeline docs live in the sibling ai-applications repo
