# Article Body: MDX → JSON blocks (opt-in) — Design Spec

- **Date:** 2026-07-01
- **Status:** Proposal (not approved). Follow-up to the article-pipeline gaps work (ai-applications #366, tucaken-app #214).
- **Repos affected:** `ai-applications` (Writer + public-api), shared DB (`articles`), `tucaken-app` (admin preview), `frontend-portfolio` (public renderer).
- **Decision required before build:** the v1 block set, and where the shared block schema lives.

## Problem

The article body is stored and generated as an **MDX string** with JSX components (`<Callout>`, `<MermaidChart>`, `<ImageRequest>`, …). This couples the AI output contract to a specific renderer and has three concrete costs (all verified against the live code):

1. **Component drift is silent.** The portfolio renders via `next-mdx-remote/rsc`; an unknown component renders as an empty element with no error. A Writer prompt change that emits a component the renderer doesn't map produces a blank spot, not a failure.
2. **Admin preview and portfolio diverge.** The portfolio uses `next-mdx-remote` (compiles JSX); the tucaken-app admin preview (`MdxPreview`) uses **`react-markdown`, which cannot parse JSX** and strips it (`skipHtml`). So `ImageRequest`/`VideoRequest`/quiz components render on the portfolio but **not** in the admin preview — the author never sees what actually ships.
3. **MDX is a parsing/injection surface.** Compiling model-authored MDX+JSX at request time is inherently riskier than rendering a validated data structure.

A JSON **block model** (portable-text style) fixes all three: content becomes validated data, the UI owns formatting, and one shared renderer serves both surfaces.

**Head start:** `frontend-portfolio` already ships a typed-but-unused block schema at `apps/site/src/lib/types/content-blocks.ts` (discriminated union: `code-snippet`, `architecture-diagram`, `security-policy`, `process-timeline`, `callout`, `smart-image`) with Zod schemas in `content-schemas.ts` and an `assertNever` helper. The content contract already carries a `contentType` discriminator (`'mdx' | 'markdown' | 'html'`, today always `'markdown'`). So this is an extension, not a greenfield build.

## Non-goals

- **No big-bang migration.** Existing articles keep rendering via the MDX path untouched.
- **Not removing MDX now.** `MDXRenderer` stays for legacy content until (and unless) a backfill completes.
- **No change to the topic-discovery / brief work** (#366/#214) — orthogonal.

## Recommended approach — Hybrid, opt-in

Extend the existing `contentType` discriminator to include **`'blocks'`**. Add a **`BlockRenderer`** alongside the current `MDXRenderer`. New articles opt into `'blocks'`; existing articles stay `'markdown'` and continue through `MDXRenderer`. **One shared block→React mapping** is consumed by both the portfolio and the admin preview, so the admin previews exactly what ships (fixing cost #2). No existing article is touched.

## The block model (v1)

Reuse and extend `content-blocks.ts`. Canonical v1 block set (a discriminated union on `type`):

| Block | Shape | Maps to existing |
| --- | --- | --- |
| `heading` | `{ level: 1-4, text, id }` | h2/h3 overrides |
| `paragraph` | `{ spans: InlineSpan[] }` (`text` / `code` / `link` / `strong` / `em`) | prose |
| `code` | `{ language, code, filename?, highlights? }` | `CodeSnippetBlock` / `CodeBlock` |
| `mermaid` | `{ chart, caption? }` | `ArchitectureDiagramBlock` / `Mermaid` |
| `image` | `{ id, instruction, kind, alt?, caption? }` | `ImageRequest` (same CloudFront `/images/articles/{id}.{ext}` resolution + amber fallback) |
| `callout` | `{ variant: info\|warning\|security\|insight, title?, children: Block[] }` | `Callout` (nested) |
| `list` | `{ ordered, items: Block[][] }` | ul/ol |
| `table` | `{ headers: string[], rows: string[][] }` | `MDXTable` |
| `quote` | `{ children: Block[] }` | blockquote |

Retain the domain blocks already defined (`security-policy`, `process-timeline`, `smart-image`, plus `video` and the quiz blocks `ScenarioKeywords`/`EliminationList`) so nothing the current MDX set can express is lost.

**Single source of truth:** the block types + Zod schema must live in **one** place shared by the pipeline (validate output), the portfolio (validate input), and the admin (preview) — not three drifting copies. Options: (a) a small shared package; (b) keep the canonical schema in `frontend-portfolio/content-blocks.ts` and add a **schema-parity test** in the other repos that fails if their local copy drifts. Recommend (a) if a shared package is cheap; otherwise (b).

## Data contract

Additive migration on `articles`:
- `content_format TEXT NOT NULL DEFAULT 'markdown'` (`'markdown' | 'blocks'`).
- `content_blocks JSONB` — the validated `ContentBlock[]` when `content_format = 'blocks'`. `content_md` stays authoritative for markdown articles (and can hold a plain-text fallback for search/`content_tsv`).

`public-api` returns `{ contentType, content }` where `contentType` is derived from `content_format` and `content` is the MDX string **or** the blocks array. Frontend `ArticleContent` type widens to `contentType: 'markdown' | 'blocks'`, `content: string | ContentBlock[]`.

## Pipeline changes (ai-applications)

- **Writer gains a `blocks` output mode:** a structured-output tool schema that emits `ContentBlock[]` directly (no MDX string). The existing MDX Writer stays for the markdown path. Opt-in per run (a brief flag / env). Emitting blocks directly is cleaner long-term and removes MDX authoring entirely for opt-in articles.
- **QA** validates blocks the same way it validates MDX today: schema-valid, single H1/heading hierarchy, every `image` has an `id`, no empty blocks. The Gap 4 **Specificity & Result** dimension and the Gap 3 **verified-metrics** rules are format-agnostic and apply unchanged.
- **Interim/backfill alternative:** an MDX→blocks converter (remark AST → blocks) can transform existing `content_md`. This is the **backfill tool**, not the primary path — new articles should emit blocks directly.

## Renderers

- **Portfolio `BlockRenderer`** — exhaustive `switch (block.type)` (+ `assertNever`) mapping each block to a React component, **reusing the existing** `Mermaid`/`Callout`/`SmartImage`/`CodeBlock`/`ImageRequest` components. The article page selects `BlockRenderer` when `contentType === 'blocks'`, else `MDXRenderer` (backward compatible).
- **Admin `BlockPreview`** — uses the **same** block→React mapping (extract it to a shared component set, or mirror with a parity test). This is the payoff: admin preview === portfolio output, ending the react-markdown divergence.

## Rollout (phased, each phase independently shippable)

1. **Phase 1 — render-only.** Shared block types + Zod schema; portfolio `BlockRenderer` behind the `contentType` switch; admin `BlockPreview`. No pipeline change. Prove it with hand-authored block fixtures rendered in both surfaces (parity test).
2. **Phase 2 — generate.** Writer `blocks` mode (opt-in per article) + the data contract (`content_format`/`content_blocks`, public-api). Generate a handful of opt-in articles end-to-end.
3. **Phase 3 — (optional) backfill.** MDX→blocks converter over existing `content_md`; flip the default once confident. Retire `MDXRenderer` only after backfill is complete and verified.

## Risks

- **Schema drift across three repos** → shared package + a schema-parity test that breaks CI on divergence.
- **Model emits invalid/inconsistent blocks** → Zod validation gate at persist + QA structural checks; reject to `flagged` on invalid blocks (never render unvalidated JSON).
- **Reader-facing regression** → Phase 1 is render-only and opt-in; existing articles never change path.

## Testing

- Block schema round-trip (parse → serialise → parse).
- `BlockRenderer` behaviour test per block type; `assertNever` exhaustiveness.
- **Parity test:** one golden article's blocks render identically (same DOM) in the portfolio renderer and the admin preview.
- Pipeline `blocks`-mode output validates against the shared Zod schema.
- Backward-compat: a `markdown` article still renders via `MDXRenderer` unchanged.

## Effort (from the grounded UI review)

- Portfolio `BlockRenderer` ~200–400 LOC · contract change ~20–50 LOC · admin `BlockPreview` ~150–300 LOC · optional MDX→blocks converter ~500–1000 LOC + tests. The existing `content-blocks.ts` schema and component set materially reduce this.

## Recommendation

Do **Phase 1 (render-only, opt-in)** first — it is low-risk (no pipeline or DB change, existing articles untouched), and it already delivers a real win: the admin preview stops diverging from the portfolio. Decide Phases 2–3 after seeing Phase 1 in use.
