# Article Preview Route — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app article preview route at `/articles/preview/$slug` so admins can preview MDX content inside tucaken-app without depending on the portfolio site.

**Architecture:** Standalone route outside the `_dashboard` layout (no sidebar), with its own auth `beforeLoad` guard. Fetches content via existing `getArticleContentFn`, article metadata via a new `getArticleMetadataFn`, and version history via existing `getArticleVersionsFn`. Renders a 70/30 split: dark prose area on the left (using existing `MdxPreview`) and a collapsible metadata + version panel on the right.

**Tech Stack:** TanStack Router (file-based routing), TanStack Query (`useQuery`), `@mdx-js/mdx` (via existing `MdxPreview`), Tailwind v4, Heroicons, TypeScript.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/server/articles.ts` | Add `getArticleMetadataFn` + `ArticleMetadata` type |
| Modify | `src/lib/api/query-keys.ts` | Add `metadata` key to `adminKeys.articles` |
| Modify | `src/hooks/use-admin-articles.ts` | Add `useArticleMetadata` hook |
| Create | `src/features/articles/components/ArticlePreviewMeta.tsx` | Collapsible metadata + version panel |
| Create | `src/app/articles.preview.$slug.tsx` | Preview page route |
| Modify | `src/features/articles/components/ArticleVersionsList.tsx` | `handlePreview` → internal navigation |
| Modify | `src/features/ai-agent/components/AiArticlesList.tsx` | `handlePreview` → internal navigation |

---

### Task 1: Add `ArticleMetadata` type and `getArticleMetadataFn` server function

**Files:**
- Modify: `src/server/articles.ts`

The admin-api `GET /articles/:slug` returns `{ article: { slug, title, excerpt, tags, status, aiGenerated, aiModel, publishedAt, coverImage, createdAt, updatedAt } }`. Add a typed server function that fetches this and returns null on 404.

- [ ] **Step 1: Add `ArticleMetadata` interface and server function**

Open `src/server/articles.ts`. After the `ArticleVersion` interface (around line 53), add:

```ts
/** Metadata returned by GET /articles/:slug on admin-api (PostgreSQL record). */
export interface ArticleMetadata {
  slug: string
  title: string
  excerpt: string | null
  tags: string[]
  status: string
  aiGenerated: boolean
  aiModel: string | null
  publishedAt: string | null
  coverImage: string | null
  createdAt: string | null
  updatedAt: string | null
}
```

Then add after the existing `getArticleVersionsFn` at the bottom of the file:

```ts
/**
 * Fetches article metadata by slug from admin-api (PostgreSQL record).
 *
 * @param data - The article slug
 * @returns ArticleMetadata or null if not found
 */
export const getArticleMetadataFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAuth()
    try {
      const body = await apiFetch<{ article: ArticleMetadata }>(
        `/articles/${encodeURIComponent(slug)}`,
        { pathTemplate: '/articles/:slug' },
      )
      return body.article
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('[404]')) return null
      throw err
    }
  })
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors from `src/server/articles.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/articles.ts
git commit -m "feat(articles): add getArticleMetadataFn server function"
```

---

### Task 2: Add query key and `useArticleMetadata` hook

**Files:**
- Modify: `src/lib/api/query-keys.ts`
- Modify: `src/hooks/use-admin-articles.ts`

- [ ] **Step 1: Add `metadata` key to `adminKeys.articles`**

Open `src/lib/api/query-keys.ts`. In the `articles` object, add a `metadata` key after the existing `content` key:

```ts
articles: {
  /** All article queries (list + content) */
  all: ['admin', 'articles'] as const,
  /** Article listing by status filter */
  list: (status: string) => ['admin', 'articles', 'list', status] as const,
  /** Individual article content for the editor */
  content: (slug: string) => ['admin', 'articles', 'content', slug] as const,
  /** Individual article metadata from GET /articles/:slug */
  metadata: (slug: string) => ['admin', 'articles', 'metadata', slug] as const,
},
```

- [ ] **Step 2: Add `useArticleMetadata` hook**

Open `src/hooks/use-admin-articles.ts`. Add this import alongside the existing server function imports:

```ts
import {
  getArticlesFn,
  getArticleContentFn,
  getArticleVersionsFn,
  getArticleMetadataFn,         // ← add this
  publishArticleFn,
  unpublishArticleFn,
  deleteArticleFn,
  saveArticleMetadataFn,
  saveArticleContentFn,
  type ArticleVersion,
  type ArticleMetadata,          // ← add this
} from '../server/articles'
```

Also add this re-export after `export type { ArticleVersion }`:

```ts
export type { ArticleVersion, ArticleMetadata }
```

Then add the hook after `useArticleVersions`:

```ts
/**
 * Fetches article metadata (slug, title, status, tags, etc.) from admin-api.
 *
 * @param slug - Article slug identifier
 * @returns TanStack Query result with ArticleMetadata or null
 */
export function useArticleMetadata(slug: string) {
  return useQuery({
    queryKey: adminKeys.articles.metadata(slug),
    queryFn: () => getArticleMetadataFn({ data: slug }),
    staleTime: 30_000,
  })
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/query-keys.ts src/hooks/use-admin-articles.ts
git commit -m "feat(articles): add useArticleMetadata hook and query key"
```

---

### Task 3: Create `ArticlePreviewMeta` component

**Files:**
- Create: `src/features/articles/components/ArticlePreviewMeta.tsx`

This is the collapsible right panel. It receives metadata and version data as props and renders them in two sections.

- [ ] **Step 1: Create the component file**

Create `src/features/articles/components/ArticlePreviewMeta.tsx` with this content:

```tsx
"use client"
import type { ArticleMetadata, ArticleVersion } from '@/hooks/use-admin-articles'

interface VersionData {
  slug: string
  totalVersions: number
  versions: ArticleVersion[]
}

interface ArticlePreviewMetaProps {
  metadata: ArticleMetadata | null | undefined
  versionData: VersionData | null | undefined
  metaIsLoading: boolean
  versionsIsLoading: boolean
}

const STATUS_CLASS: Record<string, string> = {
  draft:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  published:  'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  flagged:    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  review:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  rejected:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  processing: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
}

const QA_CLASS: Record<string, string> = {
  approve: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  revise:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  reject:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
}

export function ArticlePreviewMeta({
  metadata,
  versionData,
  metaIsLoading,
  versionsIsLoading,
}: ArticlePreviewMetaProps) {
  const latestVersion = versionData?.versions
    ? [...versionData.versions].sort((a, b) => b.version - a.version)[0]
    : null

  return (
    <aside className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto">
      <div className="divide-y divide-zinc-800">

        {/* ── Article Info ─────────────────────────────────────────────────── */}
        <div className="px-4 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Article Info
          </p>
          {metaIsLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 w-3/4 rounded bg-zinc-800" />
              <div className="h-3 w-1/2 rounded bg-zinc-800" />
              <div className="h-3 w-2/3 rounded bg-zinc-800" />
            </div>
          ) : metadata === null ? (
            <p className="text-xs text-zinc-500 italic">Metadata unavailable</p>
          ) : metadata ? (
            <dl className="space-y-2.5 text-xs">
              <div>
                <dt className="text-zinc-500">Status</dt>
                <dd className="mt-0.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[metadata.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {metadata.status}
                  </span>
                </dd>
              </div>
              {metadata.excerpt && (
                <div>
                  <dt className="text-zinc-500">Excerpt</dt>
                  <dd className="mt-0.5 text-zinc-300 leading-relaxed line-clamp-4">{metadata.excerpt}</dd>
                </div>
              )}
              {metadata.tags.length > 0 && (
                <div>
                  <dt className="text-zinc-500">Tags</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {metadata.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {metadata.aiModel && (
                <div>
                  <dt className="text-zinc-500">AI Model</dt>
                  <dd className="mt-0.5 font-mono text-zinc-300">{metadata.aiModel}</dd>
                </div>
              )}
              {metadata.publishedAt && (
                <div>
                  <dt className="text-zinc-500">Published</dt>
                  <dd className="mt-0.5 text-zinc-300">
                    {new Date(metadata.publishedAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </dd>
                </div>
              )}
              {metadata.updatedAt && (
                <div>
                  <dt className="text-zinc-500">Updated</dt>
                  <dd className="mt-0.5 text-zinc-300">
                    {new Date(metadata.updatedAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </dd>
                </div>
              )}
            </dl>
          ) : null}
        </div>

        {/* ── Latest QA ────────────────────────────────────────────────────── */}
        {latestVersion?.qaRecommendation && (
          <div className="px-4 py-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Latest QA — v{latestVersion.version}
            </p>
            <div className="space-y-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QA_CLASS[latestVersion.qaRecommendation] ?? ''}`}>
                {latestVersion.qaRecommendation}
                {latestVersion.qaTotalScore !== undefined && ` · ${latestVersion.qaTotalScore}/100`}
              </span>
              {latestVersion.qaIssues && latestVersion.qaIssues.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {latestVersion.qaIssues.map((issue, i) => (
                    <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
                      <span className="mt-0.5 shrink-0 text-amber-500">·</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ── Pipeline Versions ────────────────────────────────────────────── */}
        <div className="px-4 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Pipeline History
            {versionData && (
              <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
                {versionData.totalVersions}
              </span>
            )}
          </p>
          {versionsIsLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 rounded bg-zinc-800" />
              <div className="h-8 rounded bg-zinc-800" />
            </div>
          ) : !versionData?.versions?.length ? (
            <p className="text-xs text-zinc-500 italic">No pipeline runs yet.</p>
          ) : (
            <div className="space-y-2">
              {[...versionData.versions]
                .sort((a, b) => b.version - a.version)
                .map((v) => (
                  <div
                    key={v.sk}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
                  >
                    <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-300">
                      v{v.version}
                    </span>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[v.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                      {v.status}
                    </span>
                    {v.qaRecommendation && (
                      <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QA_CLASS[v.qaRecommendation] ?? ''}`}>
                        QA: {v.qaRecommendation}
                        {v.qaTotalScore !== undefined && ` (${v.qaTotalScore})`}
                      </span>
                    )}
                    <time className="ml-auto text-xs text-zinc-500" dateTime={v.createdAt}>
                      {new Date(v.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short',
                      })}
                    </time>
                  </div>
                ))}
            </div>
          )}
        </div>

      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/articles/components/ArticlePreviewMeta.tsx
git commit -m "feat(articles): add ArticlePreviewMeta collapsible panel"
```

---

### Task 4: Create the `/articles/preview/$slug` route

**Files:**
- Create: `src/app/articles.preview.$slug.tsx`

This is the main route file. It sits outside `_dashboard` (no sidebar), has its own auth guard, and composes the two-column layout.

- [ ] **Step 1: Create the route file**

Create `src/app/articles.preview.$slug.tsx`:

```tsx
"use client"
import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ChevronDoubleRightIcon, ChevronDoubleLeftIcon } from '@heroicons/react/20/solid'
import { useArticleContent, useArticleMetadata, useArticleVersions } from '@/hooks/use-admin-articles'
import { MdxPreview } from '@/features/articles/components/MdxPreview'
import { ArticlePreviewMeta } from '@/features/articles/components/ArticlePreviewMeta'

export const Route = createFileRoute('/articles/preview/$slug')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.user) {
      throw redirect({ to: '/sign-in', search: { callbackUrl: location.href } })
    }
  },
  component: ArticlePreviewPage,
})

const STATUS_CLASS: Record<string, string> = {
  draft:      'bg-amber-900/30 text-amber-300 ring-1 ring-amber-500/30',
  published:  'bg-teal-900/30 text-teal-300 ring-1 ring-teal-500/30',
  flagged:    'bg-orange-900/30 text-orange-300 ring-1 ring-orange-500/30',
  review:     'bg-blue-900/30 text-blue-300 ring-1 ring-blue-500/30',
  rejected:   'bg-red-900/30 text-red-300 ring-1 ring-red-500/30',
  processing: 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700',
}

function ArticlePreviewPage() {
  const { slug } = Route.useParams()
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(true)

  const { data: contentData, isLoading: contentLoading } = useArticleContent(slug)
  const { data: metadata, isLoading: metaLoading } = useArticleMetadata(slug)
  const { data: versionData, isLoading: versionsLoading } = useArticleVersions(slug)

  const title = metadata?.title ?? slug
  const status = metadata?.status ?? 'draft'

  function handleBack() {
    navigate({ to: '/ai-agent' })
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="h-4 w-px bg-zinc-800" />

        <h1 className="flex-1 truncate text-sm font-medium text-zinc-200">{title}</h1>

        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? STATUS_CLASS['draft']}`}>
          {status}
        </span>

        <div className="h-4 w-px bg-zinc-800" />

        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          title={panelOpen ? 'Hide info panel' : 'Show info panel'}
        >
          {panelOpen
            ? <ChevronDoubleRightIcon className="h-3.5 w-3.5" />
            : <ChevronDoubleLeftIcon className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{panelOpen ? 'Hide panel' : 'Show panel'}</span>
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Prose area */}
        <main className="flex-1 overflow-y-auto px-6 py-12">
          <div className="mx-auto max-w-3xl">
            {contentLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-8 w-2/3 rounded bg-zinc-800" />
                <div className="h-4 w-full rounded bg-zinc-800" />
                <div className="h-4 w-5/6 rounded bg-zinc-800" />
                <div className="h-4 w-4/5 rounded bg-zinc-800" />
              </div>
            ) : contentData === null ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-8 py-12 text-center">
                <p className="text-sm font-medium text-zinc-300">Content not found</p>
                <p className="mt-1 text-xs text-zinc-500">
                  No S3 content exists yet for <code className="font-mono text-zinc-400">{slug}</code>.
                  The article may still be in an early pipeline stage.
                </p>
              </div>
            ) : (
              <MdxPreview content={contentData?.content ?? ''} />
            )}
          </div>
        </main>

        {/* Metadata panel */}
        {panelOpen && (
          <ArticlePreviewMeta
            metadata={metadata}
            versionData={versionData}
            metaIsLoading={metaLoading}
            versionsIsLoading={versionsLoading}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Confirm route appears in generated route tree**

```bash
grep "articles/preview" /Users/nelsonlamounier/Desktop/portfolio/tucaken-app/src/routeTree.gen.ts
```

Expected: The dev server auto-generates the route tree. If not yet generated, start dev server briefly:
```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npm run dev &
sleep 5 && grep "articles/preview" src/routeTree.gen.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/app/articles.preview.$slug.tsx
git commit -m "feat(articles): add /articles/preview/\$slug route"
```

---

### Task 5: Update `handlePreview` in `ArticleVersionsList`

**Files:**
- Modify: `src/features/articles/components/ArticleVersionsList.tsx`

Replace the external `window.open` call with internal TanStack Router navigation.

- [ ] **Step 1: Add `useNavigate` import**

In `src/features/articles/components/ArticleVersionsList.tsx`, add `useNavigate` to the `@tanstack/react-router` import. The file currently doesn't import from that package, so add a new import at the top of the imports section:

```ts
import { useNavigate } from '@tanstack/react-router'
```

- [ ] **Step 2: Replace `handlePreview`**

In `ArticleVersionsList` (the function body, before the `return`), add `useNavigate` and replace `handlePreview`:

```ts
// Before (lines 109–111):
function handlePreview(): void {
  const baseUrl = import.meta.env?.PROD ? 'https://nelsonlamounier.com' : 'http://localhost:3000'
  globalThis.window.open(`${baseUrl}/articles/${article.slug}`, '_blank', 'noopener,noreferrer')
}

// After — add useNavigate near the top of ArticleVersionsList body (alongside the other hooks):
const navigate = useNavigate()

// Then replace handlePreview:
function handlePreview(): void {
  void navigate({ to: '/articles/preview/$slug', params: { slug: article.slug } })
}
```

The full function body of `ArticleVersionsList` should now start with:

```ts
export function ArticleVersionsList({ article }: ArticleVersionsListProps) {
  const [githubUrl, setGithubUrl] = useState(article.githubUrl ?? '')
  const [githubSaved, setGithubSaved] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const navigate = useNavigate()                         // ← add
  const updateMetadata = useUpdateMetadata()
  // ... rest unchanged
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/articles/components/ArticleVersionsList.tsx
git commit -m "fix(articles): route preview link to internal /articles/preview/\$slug"
```

---

### Task 6: Update `handlePreview` in `AiArticlesList`

**Files:**
- Modify: `src/features/ai-agent/components/AiArticlesList.tsx`

- [ ] **Step 1: Add `useNavigate` import**

In `src/features/ai-agent/components/AiArticlesList.tsx`, add `useNavigate` to the existing `@tanstack/react-router` import or add a new one if it doesn't exist. Check the current imports — there is no `@tanstack/react-router` import yet, so add:

```ts
import { useNavigate } from '@tanstack/react-router'
```

- [ ] **Step 2: Add `useNavigate` hook call in `AiArticlesList`**

In the `AiArticlesList` function body, add `const navigate = useNavigate()` after the existing state declarations:

```ts
export function AiArticlesList() {
  const { data, isLoading, error, refetch } = useAdminArticles()
  const [reviewBannerDismissed, setReviewBannerDismissed] = useState(false)
  const navigate = useNavigate()                         // ← add
  // ... rest unchanged
```

- [ ] **Step 3: Replace `handlePreview`**

Replace lines 86–91:

```ts
// Before:
function handlePreview(slug: string) {
  const baseUrl = import.meta.env?.PROD
    ? 'https://nelsonlamounier.com'
    : 'http://localhost:3000'
  globalThis.window.open(`${baseUrl}/articles/${slug}`, '_blank', 'noopener,noreferrer')
}

// After:
function handlePreview(slug: string) {
  void navigate({ to: '/articles/preview/$slug', params: { slug } })
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-agent/components/AiArticlesList.tsx
git commit -m "fix(ai-agent): route preview link to internal /articles/preview/\$slug"
```

---

### Task 7: Smoke-test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app && npm run dev
```

Open browser at `http://localhost:5001`.

- [ ] **Step 2: Navigate to preview**

1. Sign in (if not already)
2. Go to `/ai-agent` — find an article with status `review` or `published`
3. Click the "Preview" button (eye icon or "Preview" menu item)
4. Verify browser navigates to `http://localhost:5001/articles/preview/<slug>` (not to port 3000)
5. Verify the article MDX content renders in the prose area

- [ ] **Step 3: Verify metadata panel**

1. Panel should be open by default showing Article Info section
2. Check status badge, tags, excerpt, model name appear
3. If article has pipeline versions, verify they appear in Pipeline History
4. Click "Hide panel" button — panel should collapse
5. Click "Show panel" button — panel should reappear

- [ ] **Step 4: Verify back navigation**

Click "Back" button — should navigate to `/ai-agent`.

- [ ] **Step 5: Test from Articles page**

1. Go to `/articles` in the dashboard
2. Expand an article accordion
3. Click Options → Preview
4. Verify same internal navigation to `/articles/preview/<slug>`

- [ ] **Step 6: Test content-not-found state**

If an article exists in the list but has no S3 content (early draft), the prose area should show the "Content not found" message rather than crashing.
