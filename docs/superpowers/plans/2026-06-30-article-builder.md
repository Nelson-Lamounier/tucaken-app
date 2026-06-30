# Article Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual Article Builder so an admin can author an article from a blank page, choose publish destinations (portfolio and/or Tucaken), attach a cover image, and be blocked from slug collisions.

**Architecture:** A new `destinations TEXT[]` column on the shared `articles` table drives per-site filtering. The `public-api` filters portfolio reads by `destinations @> ARRAY['portfolio']`. `admin-api` gains a `POST` create endpoint and a slug-availability check. The tucaken-app frontend gets a TanStack-Form builder at `/articles/new`, reusing the existing presigned-upload and markdown-editor code.

**Tech Stack:** TanStack Start/Router/Query/Form, Zod, React 19, Tailwind v4, Vitest (tucaken-app); Hono + node-postgres + Vitest (admin-api & public-api); raw SQL migrations (platform-rds-bootstrap).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-article-builder-design.md`.
- Package manager: Yarn 4 only (`yarn`, never `npm`/`npx`).
- Slug regex (verbatim, used everywhere): `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`.
- `destinations` default everywhere: `['portfolio']`; min length 1 on input.
- Allowed destination values: `new Set(['portfolio', 'tucaken'])`.
- Zod at every server boundary; `requireAdmin()` on every new frontend server fn; `requireAdminGroup()` already guards the admin-api router.
- SonarQube: no nested ternaries (guard clauses/early returns), `Set` for membership, stable React keys (use slug, never index), `Number.parseInt`/`Number.isNaN`, no redundant casts, no `console` (use Pino), `crypto.randomUUID()` for any id.
- UK English in all prose/copy; product name "Tucaken"; `rounded-md`; Geist headings / Inter body; light + dark.
- Before claiming any task done in tucaken-app: `yarn typecheck && yarn lint && yarn test`.
- Two repos: Tasks 1–2 in `ai-applications` (companion PR); Tasks 3–9 in `tucaken-app` (this worktree). The migration (Task 1) must be applied to the dev DB before destination filtering is observable end-to-end.

---

### Task 1: `destinations` column (migration + bootstrap)

**Repo:** `ai-applications`

**Files:**
- Create: `applications/platform-rds-bootstrap/migrations/104_article_destinations.sql`
- Modify: `applications/platform-rds-bootstrap/src/bootstrap.ts` (articles DDL block ~line 150–167; mirror the `ADD COLUMN IF NOT EXISTS` pattern at line 231)

**Interfaces:**
- Produces: `articles.destinations TEXT[] NOT NULL DEFAULT ARRAY['portfolio']` + GIN index `idx_articles_destinations`.

- [ ] **Step 1: Write the migration file**

```sql
-- 104_article_destinations.sql
-- Add per-site publish targeting to articles. Existing rows default to
-- ['portfolio'] so current portfolio visibility is preserved.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS destinations TEXT[] NOT NULL DEFAULT ARRAY['portfolio'];

CREATE INDEX IF NOT EXISTS idx_articles_destinations
  ON articles USING GIN (destinations);
```

- [ ] **Step 2: Mirror the column in bootstrap.ts**

After the existing `ALTER TABLE articles ADD COLUMN IF NOT EXISTS cover_image TEXT;` line (~231), add:

```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS destinations TEXT[] NOT NULL DEFAULT ARRAY['portfolio'];
CREATE INDEX IF NOT EXISTS idx_articles_destinations ON articles USING GIN (destinations);
```

- [ ] **Step 3: Apply to the dev DB**

Run the project's migration runner (the same one used for `103_*`). Verify:

```bash
# psql against the dev cluster
\d articles
```

Expected: `destinations | text[] | not null | ARRAY['portfolio'::text]` and `idx_articles_destinations` present.

- [ ] **Step 4: Commit**

```bash
git add applications/platform-rds-bootstrap/migrations/104_article_destinations.sql applications/platform-rds-bootstrap/src/bootstrap.ts
git commit -m "feat(db): add articles.destinations for per-site publishing"
```

---

### Task 2: `public-api` portfolio destination filter

**Repo:** `ai-applications`

**Files:**
- Modify: `api/public-api/src/routes/articles.ts` (list query line 55–57; single query line 89–92)
- Test: `api/public-api/src/routes/articles.test.ts` (create if absent; follow the repo's existing route-test pattern)

**Interfaces:**
- Consumes: `articles.destinations` (Task 1).
- Produces: `GET /api/articles` and `GET /api/articles/:slug` return only articles whose `destinations` contains `'portfolio'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
// Use the repo's existing test harness for public-api routes (in-memory pg mock
// or test DB). Mirror the setup already used by neighbouring *.test.ts files.

describe('GET /api/articles destination filter', () => {
  it('excludes published articles not targeted at portfolio', async () => {
    // seed: article A status=published destinations={tucaken}
    //       article B status=published destinations={portfolio}
    const res = await app.request('/api/articles')
    const body = await res.json()
    const slugs = body.articles.map((a: { slug: string }) => a.slug)
    expect(slugs).toContain('article-b')
    expect(slugs).not.toContain('article-a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace public-api test -- articles` (or the repo's test command)
Expected: FAIL — article-a is still returned.

- [ ] **Step 3: Add the filter to both queries**

List query (was `WHERE status = 'published'`):

```sql
SELECT slug, title, excerpt, published_at, tags, cover_image
  FROM articles
 WHERE status = 'published'
   AND destinations @> ARRAY['portfolio']
```

Single query (was `WHERE slug = $1 AND status = 'published'`):

```sql
SELECT slug, title, excerpt, content_md, tags, ai_generated, ai_model, ...
  FROM articles
 WHERE slug = $1 AND status = 'published'
   AND destinations @> ARRAY['portfolio']
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace public-api test -- articles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/public-api/src/routes/articles.ts api/public-api/src/routes/articles.test.ts
git commit -m "feat(public-api): filter portfolio articles by destinations"
```

---

### Task 3: admin-api repository — persist `destinations`

**Repo:** `tucaken-app` (this worktree), `admin-api/`

**Files:**
- Modify: `admin-api/src/lib/repositories/articles.ts`
- Test: `admin-api/src/lib/repositories/articles.test.ts` (create)

**Interfaces:**
- Produces: `Article.destinations: string[]`; `upsertArticle` and all selects round-trip `destinations`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { rowToArticle } from './articles.js'

describe('rowToArticle destinations', () => {
  it('maps destinations, defaulting to portfolio when null', () => {
    expect(rowToArticle({ destinations: ['portfolio', 'tucaken'] }).destinations)
      .toEqual(['portfolio', 'tucaken'])
    expect(rowToArticle({ destinations: null }).destinations).toEqual(['portfolio'])
  })
})
```

(If `rowToArticle` is not exported, export it for the test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test -- articles`
Expected: FAIL — `destinations` undefined.

- [ ] **Step 3: Add `destinations` to the interface and `rowToArticle`**

In the `Article` interface add:

```ts
    destinations: string[];
```

In `rowToArticle` add:

```ts
        destinations: (row['destinations'] as string[]) ?? ['portfolio'],
```

- [ ] **Step 4: Thread through `upsertArticle` and selects**

`upsertArticle` INSERT column list → add `destinations`; VALUES → add `$12`;
`ON CONFLICT … DO UPDATE SET` → add `destinations = EXCLUDED.destinations,`;
params array → add `article.destinations ?? ['portfolio']`.

Add `destinations` to the SELECT column lists in `getArticleBySlug`,
`listArticlesByStatus`, `listAllArticles`.

- [ ] **Step 5: Run tests to verify pass**

Run: `yarn workspace admin-api test -- articles`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-api/src/lib/repositories/articles.ts admin-api/src/lib/repositories/articles.test.ts
git commit -m "feat(admin-api): persist article destinations in repository"
```

---

### Task 4: admin-api routes — create + slug-available + PUT destinations

**Repo:** `tucaken-app`, `admin-api/`

**Files:**
- Modify: `admin-api/src/routes/articles.ts`
- Test: `admin-api/src/routes/articles.test.ts` (create)

**Interfaces:**
- Consumes: `upsertArticle`, `getArticleBySlug` (Task 3).
- Produces:
  - `POST /api/admin/articles` body `{ slug, title, contentMd, excerpt?, tags?, destinations?, coverImage?, status? }` → `201 { created: true, slug }` or `409 { error }` on existing slug, `400` on invalid slug.
  - `GET /api/admin/articles/slug-available?slug=…` → `{ available: boolean }`.
  - `PUT /:slug` now accepts `destinations`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
// Build the router with a mock pool; mirror existing admin-api route tests.

describe('POST /api/admin/articles', () => {
  it('creates a new article with status=draft and default destinations', async () => {
    const res = await app.request('/api/admin/articles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'hello-world', title: 'Hi', contentMd: '# Hi' }),
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ created: true, slug: 'hello-world' })
  })

  it('rejects a duplicate slug with 409', async () => {
    // seed existing 'hello-world'
    const res = await app.request('/api/admin/articles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'hello-world', title: 'Hi', contentMd: '# Hi' }),
    })
    expect(res.status).toBe(409)
  })

  it('rejects an invalid slug with 400', async () => {
    const res = await app.request('/api/admin/articles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'Bad Slug!', title: 'Hi', contentMd: '# Hi' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/admin/articles/slug-available', () => {
  it('returns available=false for an existing slug', async () => {
    const res = await app.request('/api/admin/articles/slug-available?slug=hello-world')
    expect(await res.json()).toEqual({ available: false })
  })
  it('returns available=true for a free slug', async () => {
    const res = await app.request('/api/admin/articles/slug-available?slug=free-slug')
    expect(await res.json()).toEqual({ available: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace admin-api test -- articles`
Expected: FAIL — routes not defined (404).

- [ ] **Step 3: Add the slug constant and `GET /slug-available` BEFORE `/:slug`**

Inside `createArticlesRouter`, after `router.use('*', requireAdminGroup())`:

```ts
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const ALLOWED_DESTINATIONS = new Set(['portfolio', 'tucaken']);

// Registered before '/:slug' so the static segment wins routing.
router.get('/slug-available', async (ctx) => {
  const slug = ctx.req.query('slug') ?? '';
  if (!SLUG_RE.test(slug)) return ctx.json({ available: false }, 200);
  const existing = await getArticleBySlug(getPool(config), slug);
  return ctx.json({ available: existing === null });
});
```

- [ ] **Step 4: Add `POST /` create**

```ts
router.post('/', async (ctx) => {
  const body = await ctx.req.json<Record<string, unknown>>();
  const slug = typeof body['slug'] === 'string' ? body['slug'] : '';
  const title = typeof body['title'] === 'string' ? body['title'] : '';
  const contentMd = typeof body['contentMd'] === 'string' ? body['contentMd'] : '';

  if (!SLUG_RE.test(slug)) return ctx.json({ error: 'Invalid slug' }, 400);
  if (!title || !contentMd) return ctx.json({ error: 'title and contentMd are required' }, 400);

  const rawDest = Array.isArray(body['destinations']) ? body['destinations'] as unknown[] : [];
  const destinations = rawDest.filter((d): d is string => typeof d === 'string' && ALLOWED_DESTINATIONS.has(d));
  const finalDestinations = destinations.length > 0 ? destinations : ['portfolio'];

  const pool = getPool(config);
  const existing = await getArticleBySlug(pool, slug);
  if (existing) return ctx.json({ error: 'An article with this slug already exists' }, 409);

  const status = typeof body['status'] === 'string' ? body['status'] : 'draft';

  await upsertArticle(pool, {
    slug,
    title,
    excerpt: typeof body['excerpt'] === 'string' ? body['excerpt'] : null,
    contentMd,
    tags: Array.isArray(body['tags']) ? (body['tags'] as string[]) : [],
    status,
    aiGenerated: false,
    aiModel: null,
    publishedAt: status === 'published' ? new Date() : null,
    coverImage: typeof body['coverImage'] === 'string' ? body['coverImage'] : null,
    destinations: finalDestinations,
    authorId: ctx.get('userId') ?? null,
  });

  return ctx.json({ created: true, slug }, 201);
});
```

- [ ] **Step 5: Add `destinations` to PUT allowedFields + merged**

In `allowedFields` add `'destinations'`. In the `merged` object add:

```ts
        destinations: 'destinations' in updates ? (updates['destinations'] as string[]) : existing.destinations,
```

- [ ] **Step 6: Run tests to verify pass**

Run: `yarn workspace admin-api test -- articles`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add admin-api/src/routes/articles.ts admin-api/src/routes/articles.test.ts
git commit -m "feat(admin-api): add article create + slug-available endpoints"
```

---

### Task 5: frontend server fns — create + slug check + schema

**Repo:** `tucaken-app`

**Files:**
- Modify: `src/server/articles.ts`
- Test: `src/server/__tests__/articles.test.ts` (create; mock `apiFetch` and `requireAdmin`)

**Interfaces:**
- Consumes: admin-api `POST /articles`, `GET /articles/slug-available` (Task 4); existing `saveArticleContentFn`.
- Produces:
  - `createArticleFn(data)` where `data: { slug, title, excerpt?, contentMd, tags?, destinations: string[], coverImage?, status?: 'draft'|'published' }` → `{ success: boolean, slug: string }`.
  - `checkSlugAvailableFn(slug: string)` → `{ available: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../auth-guard', () => ({ requireAdmin: vi.fn() }))
const apiFetch = vi.fn()
vi.mock('../_api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

describe('createArticleFn', () => {
  it('posts the article then writes content to S3', async () => {
    apiFetch.mockResolvedValueOnce({ created: true, slug: 'hello' }) // POST /articles
            .mockResolvedValueOnce({ saved: true, slug: 'hello', contentRef: 'x' }) // POST /content
    const { createArticleFn } = await import('../articles')
    const out = await createArticleFn({ data: {
      slug: 'hello', title: 'Hi', contentMd: '# Hi', destinations: ['portfolio'],
    } } as never)
    expect(out).toEqual({ success: true, slug: 'hello' })
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- src/server/__tests__/articles.test.ts`
Expected: FAIL — `createArticleFn` not exported.

- [ ] **Step 3: Add schemas + `createArticleFn` + `checkSlugAvailableFn`**

```ts
const DESTINATIONS = ['portfolio', 'tucaken'] as const

const createArticleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Invalid slug'),
  title: z.string().min(1),
  excerpt: z.string().optional(),
  contentMd: z.string().min(1),
  tags: z.array(z.string()).optional(),
  destinations: z.array(z.enum(DESTINATIONS)).min(1, 'Pick at least one destination'),
  coverImage: z.string().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
})

export const createArticleFn = createServerFn({ method: 'POST' })
  .inputValidator(createArticleSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const { contentMd, ...meta } = data
    const created = await apiFetch<{ created: boolean; slug: string }>(`/articles`, {
      method: 'POST',
      body: JSON.stringify({ ...meta, contentMd }),
      pathTemplate: '/articles',
    })
    // Dual content store: also write S3 content/<slug>.md for the admin editor/preview.
    await apiFetch<{ saved: boolean }>(`/content/${encodeURIComponent(created.slug)}`, {
      method: 'POST',
      body: JSON.stringify({ content: contentMd }),
      pathTemplate: '/content/:slug',
    })
    return { success: created.created, slug: created.slug }
  })

export const checkSlugAvailableFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAdmin()
    return apiFetch<{ available: boolean }>(
      `/articles/slug-available?slug=${encodeURIComponent(slug)}`,
      { pathTemplate: '/articles/slug-available' },
    )
  })
```

- [ ] **Step 4: Extend `saveMetadataSchema` with destinations**

```ts
  destinations: z.array(z.enum(['portfolio', 'tucaken'])).optional(),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test -- src/server/__tests__/articles.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/articles.ts src/server/__tests__/articles.test.ts
git commit -m "feat(articles): add create + slug-availability server functions"
```

---

### Task 6: Extract reusable `MarkdownEditor`

**Repo:** `tucaken-app`

**Files:**
- Create: `src/features/articles/components/MarkdownEditor.tsx`
- Modify: `src/features/articles/components/ArticleEditorDrawerContent.tsx` (consume the extracted component)

**Interfaces:**
- Produces: `MarkdownEditor` with props `{ value: string; onChange: (v: string) => void; minRows?: number }` rendering the Write/Preview tabs + `MdxPreview`, with char/line counts. No save logic (caller owns persistence).

- [ ] **Step 1: Read the current drawer editor**

Read `ArticleEditorDrawerContent.tsx`; identify the textarea + Write/Preview tab + `MdxPreview` block and the char/line counters (the reusable core), separate from the save/Ctrl-S logic (stays in the drawer).

- [ ] **Step 2: Create `MarkdownEditor.tsx`**

Move the editor core into a controlled component (no internal save). Reuse `MdxPreview`. Keep `rounded-md`, light+dark. Example shape:

```tsx
interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  minRows?: number
}

export function MarkdownEditor({ value, onChange, minRows = 18 }: MarkdownEditorProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  // ...tab buttons, textarea bound to value/onChange, <MdxPreview source={value} /> on preview,
  //    char/line counters derived from value.
}
```

- [ ] **Step 3: Refactor the drawer to use it**

Replace the inline editor block in `ArticleEditorDrawerContent.tsx` with
`<MarkdownEditor value={content} onChange={setContent} />`, keeping the save
button + Ctrl/Cmd+S handler in the drawer.

- [ ] **Step 4: Verify typecheck + existing behaviour**

Run: `yarn typecheck && yarn lint`
Expected: pass. Manually confirm the edit drawer still saves (Task 9 covers full UI run).

- [ ] **Step 5: Commit**

```bash
git add src/features/articles/components/MarkdownEditor.tsx src/features/articles/components/ArticleEditorDrawerContent.tsx
git commit -m "refactor(articles): extract reusable MarkdownEditor from edit drawer"
```

---

### Task 7: Route-group migration (flat → directory)

**Repo:** `tucaken-app`

**Files:**
- Create: `src/app/_dashboard/articles/route.tsx`
- Create: `src/app/_dashboard/articles/index.tsx`
- Delete: `src/app/_dashboard.articles.tsx`
- (Generated: `src/routeTree.gen.ts` — regenerated, never hand-edited.)

**Interfaces:**
- Produces: same `/_dashboard/articles` page, now directory-based, with the admin guard in `route.tsx`. Adds the slot for `new/index.tsx` (Task 8).

- [ ] **Step 1: Create `route.tsx` (layout + admin guard)**

```tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_dashboard/articles')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: () => <Outlet />,
})
```

- [ ] **Step 2: Create `index.tsx` (the existing dashboard page)**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ArticleContainer } from '../../../features/articles/components/ArticleContainer'
import { DashboardPage } from '../../../components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/articles/')({
  component: ArticlesPage,
})

function ArticlesPage() {
  return (
    <DashboardPage
      title="Article Management"
      description="Review, edit, publish, and delete Bedrock-generated article versions."
    >
      <ArticleContainer />
    </DashboardPage>
  )
}
```

- [ ] **Step 3: Delete the flat route and regenerate the tree**

```bash
git rm src/app/_dashboard.articles.tsx
yarn dev   # let the router plugin regenerate routeTree.gen.ts, then stop it
```

- [ ] **Step 4: Verify typecheck**

Run: `yarn typecheck`
Expected: pass; `/articles` route still resolves.

- [ ] **Step 5: Commit**

```bash
git add src/app/_dashboard/articles/ src/routeTree.gen.ts
git commit -m "refactor(articles): migrate route group to directory-based"
```

---

### Task 8: `ArticleBuilder` form + `/articles/new` route + dashboard button

**Repo:** `tucaken-app`

**Files:**
- Create: `src/features/articles/components/ArticleBuilder.tsx`
- Create: `src/app/_dashboard/articles/new/index.tsx`
- Modify: `src/features/articles/components/ArticleContainer.tsx` (add "New article" button)
- Test: `src/features/articles/components/__tests__/ArticleBuilder.test.tsx` (create)

**Interfaces:**
- Consumes: `createArticleFn`, `checkSlugAvailableFn` (Task 5); `MarkdownEditor` (Task 6); `uploadCoverImage` (Task 9 — wired there).
- Produces: `ArticleBuilder` form component; route `/_dashboard/articles/new`.

- [ ] **Step 1: Write the failing test (validation gates)**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticleBuilder } from '../ArticleBuilder'

describe('ArticleBuilder', () => {
  it('disables submit until at least one destination is selected', async () => {
    render(<ArticleBuilder />)
    // default has portfolio checked → submit enabled once title/slug/content valid;
    // unchecking all destinations disables submit.
    const submit = screen.getByRole('button', { name: /save draft|publish/i })
    expect(submit).toBeDisabled() // empty title/content initially
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- ArticleBuilder`
Expected: FAIL — component not found.

- [ ] **Step 3: Build `ArticleBuilder.tsx`**

TanStack Form + Zod (follow `src/features/resumes/components/ResumeForm.tsx`). Before building UI primitives, check the `tailwindplus` MCP for form/field/checkbox-group/file-upload components; port with app tokens. Requirements:
- Fields: Title → auto-derive Slug (reuse a `deriveSlug` helper — import or duplicate the one in `src/server/draft-publish.ts`; if duplicated, place in `src/features/articles/lib/derive-slug.ts` and have both import it).
- Slug field: on change (debounced ~400ms) call `checkSlugAvailableFn`; if `available === false` show inline error and set a form error that disables submit.
- Excerpt (textarea), Tags (comma/enter tag input).
- Destinations: checkbox group from `[{ id: 'portfolio', label: 'Personal portfolio' }, { id: 'tucaken', label: 'Tucaken' }]`, default `['portfolio']`, min 1 (validation error disables submit). Use the option `id` as the React key.
- Cover image: `<input type="file" accept="image/*">` → calls `uploadCoverImage` (Task 9), shows thumbnail, stores returned URL in form state as `coverImage`.
- Content: `<MarkdownEditor value={…} onChange={…} />`.
- Two submit actions: "Save draft" (`status:'draft'`) and "Publish now" (`status:'published'`), both calling `createArticleFn` then `router.navigate({ to: '/articles' })`.
- Guard clauses for validation; no nested ternaries; Pino-free client (use existing toast/notification pattern for errors).

- [ ] **Step 4: Create the route**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ArticleBuilder } from '../../../../features/articles/components/ArticleBuilder'
import { DashboardPage } from '../../../../components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/articles/new/')({
  component: NewArticlePage,
})

function NewArticlePage() {
  return (
    <DashboardPage title="New Article" description="Author an article and choose where to publish it.">
      <ArticleBuilder />
    </DashboardPage>
  )
}
```

- [ ] **Step 5: Add the "New article" button to `ArticleContainer`**

A `<Link to="/articles/new">` styled as the app's primary button (`rounded-md`), placed in the container header.

- [ ] **Step 6: Run tests + typecheck/lint**

Run: `yarn test -- ArticleBuilder && yarn typecheck && yarn lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/articles/components/ArticleBuilder.tsx src/features/articles/lib/derive-slug.ts src/app/_dashboard/articles/new/ src/features/articles/components/ArticleContainer.tsx src/features/articles/components/__tests__/ArticleBuilder.test.tsx src/routeTree.gen.ts
git commit -m "feat(articles): add manual Article Builder with destination selector"
```

---

### Task 9: Cover-image upload wiring

**Repo:** `tucaken-app`

**Files:**
- Create: `src/features/articles/lib/upload-cover-image.ts` (thin wrapper over the existing `uploadMediaFn`)
- Modify: `src/features/articles/components/ArticleBuilder.tsx` (call the helper from the cover-image input)
- Test: `src/features/articles/lib/__tests__/upload-cover-image.test.ts` (create)

**Interfaces:**
- Consumes: existing `uploadMediaFn` from `src/server/upload.ts`. It takes a `FormData` (`{ file, id? }`) and does the full presign + S3 PUT server-side, returning `{ success, url, key, id? }` where `url` is an absolute CDN URL.
- Produces: `uploadCoverImage(file: File): Promise<string>` returning the absolute `url` for `coverImage`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'

const uploadMedia = vi.fn()
vi.mock('../../../../server/upload', () => ({ uploadMediaFn: (...a: unknown[]) => uploadMedia(...a) }))

describe('uploadCoverImage', () => {
  it('posts the file via uploadMediaFn and returns the public url', async () => {
    uploadMedia.mockResolvedValue({ success: true, url: 'https://nelsonlamounier.com/articles/images/articles/cover.png', key: 'articles/images/articles/cover.png' })
    const { uploadCoverImage } = await import('../upload-cover-image')
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    const out = await uploadCoverImage(file)
    expect(uploadMedia).toHaveBeenCalledWith({ data: expect.any(FormData) })
    expect(out).toBe('https://nelsonlamounier.com/articles/images/articles/cover.png')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- upload-cover-image`
Expected: FAIL — `uploadCoverImage` not found.

- [ ] **Step 3: Implement `upload-cover-image.ts`**

```ts
import { uploadMediaFn } from '../../../server/upload'

/** Upload a cover image via the existing media presign+PUT server fn. */
export async function uploadCoverImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const result = await uploadMediaFn({ data: formData })
  return result.url
}
```

- [ ] **Step 4: Wire it into the builder's cover-image input**

In `ArticleBuilder.tsx`, the file input's `onChange` calls `uploadCoverImage(file)`, sets `coverImage` form state to the result, and renders a thumbnail; show an error toast on rejection.

- [ ] **Step 5: Run tests + typecheck/lint**

Run: `yarn test -- upload-cover-image && yarn typecheck && yarn lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/articles/lib/upload-cover-image.ts src/features/articles/lib/__tests__/upload-cover-image.test.ts src/features/articles/components/ArticleBuilder.tsx
git commit -m "feat(articles): wire cover-image presigned upload into builder"
```

---

### Task 10: Full verification + manual run

**Repo:** `tucaken-app`

- [ ] **Step 1: Full check**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all pass.

- [ ] **Step 2: Manual golden path**

Run: `yarn dev` (port 5001). As an admin (sign out/in if you were just promoted), go to `/articles` → "New article". Create an article: title, auto-slug, pick both destinations, upload a cover image, write markdown, "Save draft". Confirm it appears in the dashboard draft bucket and opens in the editor with content present (validates the dual content store).

- [ ] **Step 3: Manual edge case**

Try a slug that already exists → live check blocks submit with an inline error. Uncheck all destinations → submit disabled.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "test(articles): verify builder golden path and edge cases"
```

---

## Self-Review

- **Spec coverage:** A→Task 1; B→Tasks 3–4; C→Task 2; D→Task 5; E (route migration)→Task 7, (builder)→Task 8, (editor reuse)→Task 6, (dashboard button)→Task 8; cover image→Task 9; F (security)→folded into Tasks 4,5,8; G (tests)→each task's TDD steps; H (out of scope)→excluded. Dual content store→Task 5 Step 3. Slug collision→Tasks 4 (server 409 + slug-available) & 8 (live UI block).
- **Placeholders:** none — `NNN` resolved to `104`; `uploadMediaFn` confirmed as the real export of `src/server/upload.ts` (FormData in, `{ success, url, key }` out); the only "read first" step (Task 6 Step 1) is a deliberate inspection of the existing drawer editor, with the implementation shown immediately after.
- **Type consistency:** `destinations: string[]` used consistently across repository, routes, server fn, and form (`z.enum(['portfolio','tucaken'])`); `createArticleFn` returns `{ success, slug }` consumed by Task 8; `uploadCoverImage(file): Promise<string>` returns the absolute CDN `url`, consumed by Task 8.
