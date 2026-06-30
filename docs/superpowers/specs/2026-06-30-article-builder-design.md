# Article Builder — Design Spec

- **Date:** 2026-06-30
- **Status:** Approved (design); ready for implementation plan
- **Branch:** `worktree-feat-article-creation-system`
- **Repos touched:** `tucaken-app` (builder UI + `admin-api`), `ai-applications` (DB migration + `public-api`). `frontend-portfolio` needs no change.

## Goal

Add a manual **Article Builder** so an admin can author an article from a blank
page (bypassing the AI/Bedrock pipeline), choose **where it publishes**
(personal portfolio and/or Tucaken), attach a **cover image**, and be protected
from **slug collisions**. This completes the four incomplete gaps in the article
creation system, bundled into one coherent surface.

Deferred to later specs: real publish / CDN-ISR revalidation; the public Tucaken
articles page; batch operations; AI-model selection for manual articles.

## Context (as-is)

- Articles live in a shared PostgreSQL `articles` table. Two read paths:
  - **Portfolio** reads via `public-api` (`ai-applications`):
    `GET /api/articles` hardcodes `WHERE status='published'`; renders at
    `/articles/[slug]` from PG `content_md`.
  - **Tucaken** reads only via `admin-api` (admin-only). No public Tucaken
    articles page exists today.
- Today the **only** creation path is the AI pipeline (draft upload → S3 →
  K8s/Bedrock → PG). There is no manual create form.
- `admin-api` `PUT /:slug` is upsert-but-requires-existing (404 if absent), so a
  brand-new create needs a dedicated `POST` endpoint.
- Cover-image upload is largely already built: `POST /api/admin/assets/presign`
  issues image-scoped presigned PUT URLs (allow-list of image MIME types, scoped
  to the `articles/` prefix, 50 MB cap), and `src/server/upload.ts` already wraps
  it on the frontend.
- **Dual content store:** the portfolio's `public-api` renders from PG
  `content_md`; the admin editor/preview reads S3 `content/<slug>.md`. A
  manually-created article must write **both** or one surface renders blank.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Destination cardinality | Multi-select — `destinations TEXT[]`, default `ARRAY['portfolio']` |
| Cover-image upload | Presigned S3 PUT (reuse `assets/presign`) |
| Slug collision | Live availability check + block submit; require rename (never overwrite on create) |
| Tucaken destination | Metadata only this spec; public Tucaken page deferred |
| Bundling | One Builder spec; CDN/revalidation is a separate later spec |

## A. Data model (migration — `ai-applications`)

New migration `applications/platform-rds-bootstrap/migrations/NNN_article_destinations.sql`
(use the next available number):

```sql
ALTER TABLE articles
  ADD COLUMN destinations TEXT[] NOT NULL DEFAULT ARRAY['portfolio'];

CREATE INDEX idx_articles_destinations ON articles USING GIN (destinations);
```

- Existing rows inherit `['portfolio']` via the default — preserves current
  portfolio visibility.
- GIN index supports the `@>` array-contains filter used by `public-api`.
- Must be applied to the shared dev DB before destination filtering takes effect.

## B. `admin-api` (tucaken-app/admin-api)

### Repository — `src/lib/repositories/articles.ts`
- Add `destinations: string[]` to the `Article` interface.
- `rowToArticle`: map `row['destinations'] as string[] ?? ['portfolio']`.
- `upsertArticle`: add `destinations` to the INSERT column list, the
  `ON CONFLICT … DO UPDATE SET destinations = EXCLUDED.destinations`, and the
  params array.
- Add `destinations` to the SELECT column list in `getArticleBySlug`,
  `listArticlesByStatus`, `listAllArticles`.

### Routes — `src/routes/articles.ts`
- Add `destinations` to `allowedFields` and to the `merged` object in `PUT /:slug`.
- **New `POST /` (create):**
  - Validate body: `slug`, `title`, `contentMd` required; `excerpt`, `tags`,
    `destinations`, `coverImage`, `status` optional.
  - Slug must match `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`.
  - `getArticleBySlug` first → **409** if it already exists (no overwrite).
  - Defaults: `status='draft'`, `destinations=['portfolio']`,
    `aiGenerated=false`, `aiModel=null`, `authorId` from `ctx.get('userId')`.
  - Insert via `upsertArticle`; return `201 { created: true, slug }`.
- **New `GET /slug-available?slug=…`:**
  - Registered **before** `/:slug` so the static segment wins Hono routing.
  - Returns `{ available: boolean }` (reuses `getArticleBySlug`).
  - Mirrors the existing `/api/public/email-exists` precedent.

## C. `public-api` (ai-applications) — destination filter

In `api/public-api/src/routes/articles.ts` (the `WHERE status='published'`
query, ~line 57): change to

```sql
WHERE status = 'published' AND destinations @> ARRAY['portfolio']
```

so portfolio only surfaces portfolio-targeted articles. Optionally return
`destinations` in the JSON for transparency. The deferred Tucaken page will
later filter `@> ARRAY['tucaken']`.

## D. Frontend server fns (tucaken-app `src/server/articles.ts`)

- **`createArticleFn`** (`POST`): Zod input
  `{ slug, title, excerpt?, contentMd, tags?, destinations: string[] (min 1),
  coverImage?, status: enum default 'draft' }`; `requireAdmin`; calls
  `POST /articles`; then calls existing `saveArticleContentFn` to write
  S3 `content/<slug>.md` (**dual content store**).
- **`checkSlugAvailableFn`** (`GET`): Zod slug; `requireAdmin`; calls
  `GET /articles/slug-available`.
- Extend `saveMetadataSchema` (and any edit/unpublish path) with
  `destinations: z.array(z.string()).optional()`.
- Cover image: reuse the existing presign wrapper in `src/server/upload.ts`
  (no new backend server fn unless the wrapper needs a thin article-cover variant).

## E. Frontend UI (tucaken-app)

### Route migration (per CLAUDE.md: adding `articles/new` triggers the prefix-group migration)
Migrate flat `src/app/_dashboard.articles.tsx` → directory-based:
- `src/app/_dashboard/articles/route.tsx` — admin `beforeLoad` guard.
- `src/app/_dashboard/articles/index.tsx` — existing management dashboard
  (`ArticleContainer`).
- `src/app/_dashboard/articles/new/index.tsx` — the builder page.
Update all imports; `routeTree.gen.ts` regenerates (never hand-edited).

### `ArticleBuilder` component (`src/features/articles/components/`)
TanStack Form + Zod (follow `src/features/resumes/components/ResumeForm.tsx`).
Fields:
- **Title** (text) → auto-derives **Slug**.
- **Slug** (text, editable) — debounced live availability via
  `checkSlugAvailableFn`; inline error + **disabled submit** on collision.
- **Excerpt** (textarea).
- **Tags** (tag input).
- **Destinations** — checkbox group (Portfolio, Tucaken), multi-select, **≥1 required**.
- **Cover image** — file picker → presign PUT → thumbnail preview; stores the
  returned S3 key/URL as `coverImage`.
- **Content** — reuse the existing markdown editor (Write/Preview tabs) + `MdxPreview`.
- **Action** — Save draft (`status='draft'`) vs Publish now (`status='published'`).
- Submit → `createArticleFn` (+ S3 content write) → navigate to dashboard / preview.

### Refactor for reuse (no duplicate editor)
Extract the editor body from `ArticleEditorDrawerContent` into a shared
`MarkdownEditor` consumed by both the drawer and the builder. Reuse `MdxPreview`.

### Dashboard entry point
Add a **"New article"** button to `ArticleContainer` → `/articles/new`.

### Styling
TailwindPlus-first (check MCP before building), `rounded-md`, Geist headings /
Inter body, correct in light + dark, Motion for any transitions.

## F. Security & quality

- Zod at every boundary (form + server fn + admin-api).
- `requireAdmin` on all new server fns; `requireAdminGroup` already guards the
  admin-api router.
- Slug regex consistent across derive + validation: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`.
- Markdown rendered only through the existing sanitised `MdxPreview` path.
- Cover-image MIME allow-list + size cap already enforced server-side.
- Pino logger, never `console`; no PII/tokens logged.
- SonarQube rules: no nested ternaries (guard clauses / early returns), `Set`
  for membership/allow-lists, stable React keys (slug, not index), `Number.*`
  over globals, no redundant casts, `crypto.randomUUID()` if any id is needed.

## G. Testing (Vitest; TDD for logic-heavy parts)

- **admin-api:** `POST /` new → 201; duplicate slug → 409; `PUT /:slug` carries
  `destinations`; repository upsert/select round-trips `destinations`;
  `slug-available` true/false.
- **public-api:** a `published` article without `'portfolio'` in `destinations`
  is excluded from `GET /api/articles`.
- **frontend:** `createArticleFn` happy path + collision surfaced;
  `checkSlugAvailableFn`; builder form validation (live slug-block disables
  submit, ≥1 destination required, slug regex).

## H. Out of scope (deferred specs)

- Real publish / CDN-ISR on-demand revalidation (portfolio is Next.js ISR
  `revalidate: 3600` + `public-api` `s-maxage=300`).
- Public Tucaken articles page (the second `destinations` consumer).
- Batch operations (bulk publish/delete/tag).
- AI-model selection for manual articles (manual = `aiGenerated:false`).

## Build sequence (high level)

1. `ai-applications`: migration (A) applied to dev DB + `public-api` filter (C) —
   coordinated companion change.
2. `admin-api`: repository + routes, incl. `POST /` create and `slug-available` (B).
3. `src/server/articles.ts`: `createArticleFn`, `checkSlugAvailableFn`, schema
   extensions (D).
4. Route-group migration to directory-based (E).
5. Extract `MarkdownEditor`; build `ArticleBuilder`; wire dashboard button (E).
6. Tests throughout (G); `yarn typecheck && yarn lint && yarn test`.
