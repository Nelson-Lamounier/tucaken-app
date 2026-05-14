# Article Preview Route — Design Spec

**Date:** 2026-05-14  
**Status:** Approved

---

## Problem

The admin article list and AI-agent article list both have a "Preview" action that opens `http://localhost:3000/articles/:slug` (dev) or `https://nelsonlamounier.com/articles/:slug` (prod) in a new tab. This redirects to the `frontend-portfolio` Next.js site, which is a separate process that is not always running. Result: 404 in development, and no preview available without spinning up the portfolio site.

---

## Goal

Add an in-app article preview route to `tucaken-app` so admins can preview any article's MDX content without depending on the portfolio site. The preview should feel like a reader view — close to the production site's look — plus a collapsible metadata/version panel for review context.

---

## Architecture

### New Route

| Property | Value |
|---|---|
| Path | `/articles/preview/$slug` |
| File | `src/app/articles.preview.$slug.tsx` |
| Layout | **Outside** `_dashboard` layout — no sidebar, no top nav |
| Auth | Enforced via `requireAuth()` inside server functions; unauthenticated users will be redirected to login by the auth guard |

The route is placed outside `_dashboard` because the user approved a portfolio-style reader view with no dashboard chrome.

### Data Fetching

Three parallel TanStack server function calls on route load:

| Data | Server Function | Admin-API Endpoint |
|---|---|---|
| MDX content string | `getArticleContentFn(slug)` (existing) | `GET /content/:slug` |
| Article metadata | `getArticleMetadataFn(slug)` (new) | `GET /articles/:slug` |
| Version history | `getArticleVersionsFn(slug)` (existing) | `GET /articles/:slug/versions` |

The new `getArticleMetadataFn` is a thin addition to `src/server/articles.ts`. It calls `GET /articles/:slug` on admin-api and returns the `ArticleSummary` shape (title, status, tags, author, date, excerpt, etc.).

### Component Tree

```
ArticlePreviewPage (route)
├── PreviewTopBar          — back button, article title, status badge
├── main (two-column layout)
│   ├── ArticleProseArea   — article header (title, tags, date) + MdxPreview
│   │   └── MdxPreview     — existing, renders MDX with all custom components
│   └── ArticlePreviewMeta — new collapsible right panel
│       ├── metadata section (author, category, excerpt, QA score/recommendation)
│       └── version history (reuses same version card style as ArticleVersionsList)
```

---

## Layout

**Breakpoints:**
- `lg+` — 70/30 split: prose fills left, metadata panel fixed on right
- `< lg` — stacked: prose first, metadata panel below (collapsed by default on mobile)

**Background:** `bg-zinc-950` (dark, matches portfolio)

**Prose area:** constrained to `max-w-3xl`, centred, dark typography via `prose prose-invert prose-zinc`

**Top bar:** slim bar with `←` back button (calls `router.history.back()` with fallback to `/ai-agent`), article title truncated, status badge, and a "Close preview" label. No full nav.

**Metadata panel:**
- Collapsible via toggle button (open by default on desktop, closed on mobile)
- Sections: Article Info (title, status, author, category, date, tags, excerpt), QA (score, recommendation, issues list), Version History (newest first, same card style as `ArticleVersionsList`)
- Panel width: `w-80` fixed

---

## Changes to Existing Files

### `src/server/articles.ts`

Add `getArticleMetadataFn`:

```ts
export const getArticleMetadataFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAuth()
    try {
      const body = await apiFetch<ArticleSummary>(
        `/articles/${encodeURIComponent(slug)}`,
        { pathTemplate: '/articles/:slug' },
      )
      return body
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('[404]')) return null
      throw err
    }
  })
```

### `src/features/articles/components/ArticleVersionsList.tsx` (line 109–111)

Replace `handlePreview`:

```ts
// before
function handlePreview(): void {
  const baseUrl = import.meta.env?.PROD ? 'https://nelsonlamounier.com' : 'http://localhost:3000'
  globalThis.window.open(`${baseUrl}/articles/${article.slug}`, '_blank', 'noopener,noreferrer')
}

// after
const navigate = useNavigate()
function handlePreview(): void {
  navigate({ to: '/articles/preview/$slug', params: { slug: article.slug } })
}
```

### `src/features/ai-agent/components/AiArticlesList.tsx` (line 86–91)

Same replacement: `handlePreview` uses `useNavigate` to `/articles/preview/$slug`.

---

## New Files

| File | Purpose |
|---|---|
| `src/app/articles.preview.$slug.tsx` | Route entry point — loads data, composes layout |
| `src/features/articles/components/ArticlePreviewMeta.tsx` | Collapsible metadata + version panel |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Content not found (404) | Full-page "Article content not found" message with back button |
| Metadata not found | Render content-only view, metadata panel shows "Metadata unavailable" |
| MDX compile error | `MdxPreview` already handles this inline (red error box) |
| Unauthenticated | `requireAuth()` guard redirects to login |

---

## Out of Scope

- Like/comment features (engagement components from portfolio — admin-only preview, not needed)
- SEO / JSON-LD (internal preview page, not crawled)
- ISR/caching (TanStack Start SSR handles this via loader)
- Analytics tracking (preview, not a live page view)
