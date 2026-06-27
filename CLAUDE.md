# CLAUDE.md — tucaken-app

Authoritative guide for Claude when working in this repo. Read fully before editing.

## Stack

- **Runtime**: TanStack Start (SSR) + TanStack Router + TanStack Query + TanStack Form
- **React**: 19 (Server Components aware)
- **Build**: Vite 8, esbuild for server bundle
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` — config lives in `src/styles.css` `@theme` block (no `tailwind.config.*`)
- **State**: Zustand (client), TanStack Query (server cache)
- **Validation**: Zod
- **Animation**: `motion` (Motion for React) — import from `motion/react`, never `framer-motion`
- **Auth**: AWS Cognito + `jose`
- **Payments**: Stripe (`@stripe/*`, server `stripe`)
- **Observability**: OpenTelemetry, Pyroscope, Grafana Faro, Pino
- **Tests**: Vitest

Workspace: yarn workspaces. Root + `admin-api/`.

## Package manager — Yarn 4 only

`packageManager: yarn@4.12.0`. Never use `npm`/`pnpm`/`npx`.

- Install: `yarn install`
- Add dep: `yarn add <pkg>` (root) or `yarn workspace admin-api add <pkg>`
- Add dev dep: `yarn add -D <pkg>`
- Run script: `yarn <script>` (not `npm run`)
- Execute binary: `yarn dlx <cmd>` instead of `npx`
- Lockfile `yarn.lock` is committed. Never delete/regenerate without reason.

## Scripts

| Script | Purpose |
|---|---|
| `yarn dev` | Vite dev on port 5001 |
| `yarn build` | Vite build + server bundle |
| `yarn preview` | Preview production build |
| `yarn lint` | ESLint |
| `yarn typecheck` | `tsc --noEmit` |
| `yarn test` | Vitest run |

Before claiming a task done: `yarn typecheck && yarn lint && yarn test`.

## Repo layout

```
src/
  app/                 # TanStack Start flat-file routes (filename dots = segments)
    __root.tsx
    _dashboard.*.tsx   # routes under dashboard layout group
  features/<domain>/   # feature-sliced — primary location for new code
    components/
    hooks/
    api/ or server/
    types.ts
    store.ts           # zustand if needed
  components/
    ui/                # shared primitives (Button, Field, etc.)
    layouts/
    resume/
  contexts/            # cross-feature React contexts only
  hooks/               # cross-feature hooks only
  lib/                 # framework-agnostic utilities, clients, observability
  server/              # server-only code, patches, handlers
  styles.css           # Tailwind v4 @theme tokens
  router.tsx
  routeTree.gen.ts     # generated — never edit
admin-api/             # workspace (separate package)
```

### Where new code goes

- Belongs to a domain (auth, billing, profile, resumes, …) → `src/features/<domain>/`
- Generic primitive used in 2+ features → `src/components/ui/`
- Server-only (Node APIs, secrets, SDKs) → `src/server/` or `src/lib/<area>/server.ts`
- Route file → `src/app/` only. Never put business logic in route files; import from features.

## TanStack — modern patterns

- **Routing**: file-based in `src/app/`. Legacy routes use flat-file convention (dots = segments, e.g. `_dashboard.applications.$slug.tsx`). `_dashboard` = layout group. `$param` = dynamic. `routeTree.gen.ts` is generated — **never** hand-edit.
- **Routing migration (incremental, mandatory for new work)**: repo is migrating flat-file → directory-based. TanStack Router supports both simultaneously; mixing during transition is intended.
  - **New routes**: create directory-based only. `src/app/<segment>/<sub>/route.tsx` (and `index.tsx` for the segment's own page, `$param/route.tsx` for dynamics).
  - **Touching an existing flat route**: if the change is non-trivial (new sibling, rename, splitting logic), migrate that route's whole prefix group to directory form in the same PR. Update all imports; run `yarn typecheck`.
  - **Migration order priority** (high fan-out first): `_dashboard.applications.*` → `_dashboard.resumes.*` → `_dashboard.settings.*` → remaining `_dashboard.*` leaves → top-level routes (`checkout.*`, `sign-in.*`, `github.*`, `articles.preview.*`).
  - **Mirror feature slices**: directory tree under `src/app/_dashboard/<domain>/` should match `src/features/<domain>/`. Route file stays thin — import logic from the feature.
  - **Colocation rule**: route-private helpers go next to `route.tsx` as `-loader.ts`, `-components/`, etc. Shared logic stays in `src/features/<domain>/`.
  - **No new flat-file routes.** Only exception: a one-off leaf with no siblings and no expected growth — document why in PR description.
  - Do not rewrite untouched flat routes en masse; migration is opportunistic, driven by real work.
- **Data**: prefer `createServerFn` for server logic + `queryOptions` for the client. SSR hydration via `@tanstack/react-start` + `@tanstack/react-router-ssr-query`.
- **Loaders**: route `loader` should call `queryClient.ensureQueryData(queryOptions)` so the same query is reused client-side. Avoid raw `fetch` in components.
- **Forms**: `@tanstack/react-form` + `zod-form-adapter`. Schemas live with the feature.
- **Devtools**: `@tanstack/react-router-devtools`, `@tanstack/react-query-devtools` only mounted in dev.
- **Type safety**: rely on generated route types; never cast `as any` to silence the router.

When unsure of **any** library or API in TypeScript code, use the **context7 MCP** (`resolve-library-id` → `query-docs`) **before writing it** — always, not just for `@tanstack/*`. This is mandatory for all TypeScript work and applies to every external package (TanStack, Zod, Hono, Stripe, `ioredis`, `jose`, Motion, AWS SDK, etc.). Prefer context7 over guessing or relying on memory; it prevents wrong-API code and the rework it causes.

## Components — TailwindPlus first, no duplicates

### Source of truth for new components

1. Before creating any UI component, **check TailwindPlus via the `tailwindplus` MCP**:
   - `mcp__tailwindplus__list_component_names` / `search_component_names` to find a match.
   - `mcp__tailwindplus__get_component_by_full_name` with `framework=react`, `tailwind_version=4`, `mode=light` (or `dark`/`system` for app UI; `none` for eCommerce).
2. Port the snippet into the repo:
   - Replace hard-coded palette (`indigo-600`, etc.) with this app's tokens (see Palette below).
   - Keep semantics; rewrite class strings to use existing tokens. Never ship raw TailwindPlus colors.
3. If no TailwindPlus match exists, fall back to Headless UI (`@headlessui/react`) + Heroicons + Lucide icons already in deps. Document why a custom build was needed in the PR.

### Reuse-first rule (no duplicate components)

Before writing a new component:

```
rg -n "export (default )?function <Name>" src/
rg -n "<probable-component-name>" src/components src/features
```

- If a similar component exists and is used: **refactor it for reuse** — extract props, narrow types, rename file/symbol if the new name describes both call sites better. Move it up the tree to `src/components/ui/` if it now serves multiple features.
- Renaming: update all imports in the same commit. Run `yarn typecheck` to catch stragglers.
- Splitting: prefer composition (children/slots, render props, polymorphic `as`) over copy-paste variants.
- Deleting dead duplicates is part of the refactor — do not leave the old file behind.

### Palette / design tokens

- Defined in `src/styles.css` under `@theme`. Add new tokens there, not inline.
- Use Tailwind utility classes that resolve to those tokens. Avoid arbitrary hex (`bg-[#abc]`) outside the theme block.
- Dark mode via `next-themes`. Any new component must render correctly in both modes.

### Corner radius — default `rounded-md`

- **Default corner radius for new components is `rounded-md`** — cards, panels, tiles,
  buttons, inputs, dropdowns, badges/chips. Keep the whole surface on one radius;
  don't mix `rounded-lg`/`-xl`/`-2xl` across sibling elements of the same component.
- **Exceptions** (intentional, not flattened to `rounded-md`): `rounded-full` for
  pills, avatars, status dots, and icon-only circular buttons; `rounded-none` where a
  flush edge is the design.
- This is the convention for **new/edited** code — existing components are not
  retrofitted en masse. When you substantially touch a component, bring its radius
  in line with `rounded-md` in the same change.

### Typography — Geist headings, Inter body (system-wide)

The font pairing is **Geist for headings, Inter for body**, self-hosted via
`@fontsource-variable/geist` and `@fontsource-variable/inter` (variable fonts —
one file per family covers all weights; never add per-weight static imports).
Both are imported at the top of `src/styles.css`; do **not** add Google Fonts
`<link>`s or any third-party font request (it breaks CSP and adds a network
round-trip).

Tokens live in the `@theme` block of `src/styles.css`:

- `--font-sans` → `'Inter Variable'` — the **body default**. Applied app-wide by
  Tailwind preflight; the `font-sans` utility resolves to it.
- `--font-heading` → `'Geist Variable'` — **headings**. A base-layer rule sets
  `h1–h6 { font-family: var(--font-heading) }`, and Tailwind auto-emits a
  `font-heading` utility from the token.

Rules for new/edited UI:

- **Don't hard-code font families** (`font-['Geist']`, inline `fontFamily`, raw
  `@font-face`). Use the tokens/utilities only.
- Semantic headings (`<h1>`–`<h6>`) get Geist automatically — no class needed.
- For **non-heading text that should read as a heading** (a styled `<div>`/
  `<span>` title, kinetic/animated text, marketing display copy), add the
  `font-heading` utility explicitly so it uses Geist.
- For **body, UI chrome, labels, inputs, mono-adjacent prose**, leave the default
  (Inter via `--font-sans`); only add `font-sans` to override a Geist context.
- New tokens or weight ranges go in the `@theme` block, never inline.
- Both fonts must render correctly in light and dark mode (they're colour-agnostic,
  but verify weight/contrast on the dark surfaces this app uses).

### Dashboard layout — size-slot system (mandatory for dashboards)

Dashboards are composed from **size-based layout containers**, never ad-hoc
`grid-cols-*` on the page. The container owns the layout rule; panels stay
unchanged and inherit correct width/height/reflow. This keeps every dashboard
standard across users (no white-space gaps when data is sparse), responsive by
default, and extensible — you add a panel to the slot that matches its size
without hand-tuning a grid. Reference implementation:
`src/features/user-home/components/UserDashboard.tsx` and the primitives beside
it; tokens in `src/styles.css` (`.panel-grid`, `.split-layout`).

**The three slots (where to add a panel):**

| Slot | Size | Primitive | Behaviour | Add a panel here when… |
| --- | --- | --- | --- | --- |
| **X** | Large | `PanelStack` (full-width band) | One panel per row, full width; new panels append to the **bottom** | the panel needs the **full width** (hero, activity, wide chart) |
| **Y** | Medium | `PanelGrid` | Equal-height cards that **wrap to the next row**; the row stretches so cards stay the same height | a **medium card** that sits in a multi-up row |
| **Z** | Small | `PanelStack` (sidebar slot of `SplitLayout`) | A **list** that grows down/up, one compact widget per row | a **small/compact** widget for the rail |

**`SplitLayout`** places a wide main column (`1fr`) beside a fixed-width sidebar
rail (default 340px), collapsing to one column below `xl` (1280px). The main
column and the sidebar are each a `PanelStack`.

**Rules:**

- **Never** put business panels directly in a raw `grid`/`flex` on the page —
  use `PanelStack` / `PanelGrid` / `SplitLayout`. Layout lives in the container,
  not the panel.
- **Don't modify panel internals to fix layout.** If a panel looks wrong in its
  slot, it's either in the wrong slot or needs its own (separately reviewed)
  change.
- **Equal-height (`PanelGrid`) panels must carry a text title** so a data-sparse
  panel still reads as intentional when its cell is taller than its content.
- **Auto-fit `minmax(min(100%, <min>), 1fr)`** is the column rule (the `min()`
  guard prevents horizontal overflow on narrow screens); `auto-fit` (not
  `auto-fill`) so present cards fill the row with no trailing empty tracks.
- New dashboards replicate this system. The reusable cross-project version lives
  in the `dashboard-layout` skill (`~/.claude/skills/dashboard-layout/`).

## Animation — Motion for React

Project rule file: `.claude/rules/motion-react.md` (authoritative; this section summarises).

- Import: `motion/react` (client) or `motion/react-client` (server components). Never `framer-motion`.
- Skill: invoke the `motion` skill for any animation/visibility/transition work.
- MCP: Motion Studio MCP (`motion`) for paid examples, saved transitions, and CSS spring generation. Use `css-spring`, `motion-audit`, `see-transition` skills for tuning.
- Performance:
  - Animate `transform` / `opacity` / `clipPath` / `filter` only on `willChange`.
  - Use independent transforms (`x`, `scaleX`) when composing.
  - Never read `MotionValue.get()` during render — only in effects/`useTransform` callbacks.
- Radix integration: use `asChild` + `motion.<el>`; hoist `open`/`onOpenChange` state for exit anims; `forceMount` on Radix child of `<AnimatePresence>`.

## TypeScript code quality — SonarQube / SonarLint rules

This repo is analysed by **SonarCloud Automatic Analysis** (runs per-PR; the
quality gate blocks the PR on new issues and unreviewed Security Hotspots).
Write new TypeScript to these rules so the gate stays green — they are
requirements, not style preferences. SonarLint surfaces the same rules live in
the IDE.

- **No nested ternaries (`S3358`).** Use `if`/`else`, an early return, or a small
  helper. In JSX, split branches into separate `{cond && <X/>}` expressions or
  extract a render helper — never `a ? … : b ? … : c` in one container.
- **Guard clauses / early returns over nested conditionals.** Validate invalid
  inputs and edge cases at the top of a function and bail immediately
  (`if (!x) return …`), so the happy path stays flat and unindented. Prefer this
  to `if/else` pyramids — it also keeps you clear of `S3358` and deep nesting.
  Chain status/label logic as sequential early returns
  (`if (status === 'a') return …`) rather than ternary chains. **In React
  components, place guard returns *after* all hooks** (hooks must run
  unconditionally) — hooks first, then `if (loading) return <Skeleton/>`.
- **No redundant casts / non-null assertions (`S4325`).** Let the compiler narrow
  via type guards, `typeof`, `instanceof`, and discriminated unions; don't write
  `x as T` or `x!` when the type is already known. Catch errors as `unknown`:
  `catch (e) { if (!(e instanceof Error) || e.name !== 'X') throw e }` — never
  `catch (e: any)`. **Never** `as any` to silence types.
- **No `String(x)` / template coercion of `unknown` or objects (`S6551`).** Guard
  first: `if (typeof x === 'string' && allowed.has(x))`. Any object used in a
  string context must define `toString()`.
- **Optional chaining over `&&` (`S6582`).** `obj?.prop`, `arr?.[0]`, `fn?.(x)` —
  not `obj && obj.prop`.
- **`Number.*` over globals (`S7773`).** `Number.parseInt` / `Number.parseFloat` /
  `Number.isNaN` / `Number.isFinite` — never the bare globals.
- **`Set` for membership checks (`S7776`).** Declare constant allow-lists as
  `new Set([...])` and use `.has()`, not an array + `.includes()`.
- **Stable React keys (`S6479`).** Use a DB id or a stable content string — never
  the array index.
- **No `Math.random()` for ids/tokens (`S2245` — Security Hotspot, fails the
  gate).** Use `crypto.randomUUID()` / `node:crypto`.
- **No `console.*` in app code.** Use the Pino logger (`src/lib/observability`);
  `console` is acceptable only in CLI/ops scripts under `scripts/`.

**Verification discipline (learned the hard way):** fix findings one at a time
and run `yarn typecheck` (plus the touched tests) after each. If removing an
assertion breaks the build, the compiler genuinely needs it — that's a SonarLint
false positive, so keep it. **Never bulk `eslint --fix` type-assertions across
the repo** — it strips load-bearing casts and cascades into hundreds of errors.

## Security — non-negotiable

- **Secrets**: never commit. `.env.local` is local-only. Server-side env access only inside `src/server/` or `src/lib/**/server.ts`. Never reference `process.env.*` in client components.
- **Input validation**: every server boundary (server fn, route loader receiving params, API handler) validates with Zod. Never trust client payloads.
- **HTML**: sanitize any user-provided HTML with `dompurify` before rendering. Avoid raw-HTML React props on unsanitized content.
- **AuthN/Z**: verify JWT with `jose` against Cognito JWKS server-side. Re-check authorization on every server fn — never rely on hidden UI as access control.
- **Stripe**: webhook handlers must verify signature with the raw body. Never log full card data, secrets, or PII. Use idempotency keys for create operations.
- **SQL / queries**: parameterised only. No string-concatenated SQL.
- **Dependencies**: pin via `yarn.lock`. Avoid adding deps for trivial helpers. Audit new deps for maintenance + license before adding.
- **CSP / headers**: set in server handlers; don't disable existing security headers to silence a console warning — fix the offending code.
- **Logging**: use Pino with redaction. Never log tokens, full request bodies, or PII at info level.
- **Error surface**: client errors never leak stack traces or internal IDs.

## Workflow expectations

- Plan before non-trivial work (TanStack route changes, Stripe flows, auth, schema migrations).
- TDD for logic-heavy features (`superpowers:test-driven-development`).
- Tests: colocate (`__tests__` next to source or under `src/__tests__/`). Vitest.
- Commits: follow `git-commit` skill. Never include `Co-Authored-By` trailer.
- Don't edit `routeTree.gen.ts`, `yarn.lock` (regenerate via yarn), or files under `dist/`.

## Documentation & README authoring

This repo is part of the multi-repo **Tucaken** product (the sibling
**ai-applications** repo holds the Bedrock worker images/pipelines). The project
case-study generator reads each repo's **root `README.md`** as ground-truth
`productContext` (`ai-applications/applications/shared/src/projects/case-study-loader.ts`),
taking only the **first ~1,400 characters per repo, top-down** (ordered by chunk
index, no section search) for the case study's tagline + first pitch paragraph.
Position beats completeness — write the root README for that.

- **Lead with the product, above the fold.** The first ~800 characters must
  answer: **what** the product is, **who** it's for, **the problem** it solves,
  and **this repo's role** in the product. Everything a recruiter needs to grasp
  the product belongs here, before any stack or architecture detail.
- **This repo's role, stated explicitly.** Heads are concatenated across repos, so
  the head must say what *this* repo is: the user-facing web app and `admin-api`
  BFF — product surface, auth, billing, and Job dispatch. The AI pipelines run in
  the sibling ai-applications repo.
- **Tech depth goes below the fold.** Stack, decisions, challenges, and
  architecture sit lower for human readers; they don't shape the pitch.
- **Verify every claim** against the code and, for infrastructure claims (deploy
  flow, cluster, region, resource names), the live account/workflows before
  writing it. A README that misstates the stack poisons the generated case study.
  Do not copy forward stale claims from existing docs.
- **KB docs** (created via the `kb-doc` skill) live under `docs/` by type:
  `docs/concepts/`, `docs/decisions/` (ADRs, `NNNN-title.md`), `docs/patterns/`,
  `docs/runbooks/`, `docs/troubleshooting/`, `docs/projects/`, `docs/tools/`.
  Decision records use `docs/decisions/`, **not** `docs/adr/`.

## Language & user-facing copy

- Write **all** prose in **English (UK)** — docs, README, code comments, commit
  bodies, PR descriptions, user-facing copy. UK spelling: `-ise`/`-isation`
  (organise, optimise), `-our` (colour, behaviour), `-re` (centre), doubled
  `-ll-` (modelled, labelled). Not US forms.
- **No non-ASCII diacritics** in prose or identifiers. Write `resume`, not
  `résumé`; `cafe`, not `café`. The codebase term for the generated job document
  is **`resume`** (matches `resumeBullets`, `tailoredResumeData`,
  `resume-import-processor`) — keep docs consistent with it.
- **Product name is "Tucaken".** In user-facing copy, refer to the product as
  **Tucaken**, never "the agent". Internal glossaries (e.g. `CONTEXT.md`) may use
  "agent"/"résumé" as domain terms — that is existing internal copy, out of scope
  for new user-facing prose, which follows the rules above.

## ESLint — always run (mandatory)

**Always run `yarn lint` after any code change, before claiming a task done.** No
exceptions. Lint must pass (zero errors) before commit or PR.

- Config: `eslint.config.js` (flat config, ESLint + typescript-eslint).
- Cyclomatic complexity capped at **10** via the core `complexity` rule
  (`complexity: ['error', { max: 10 }]`). Functions above 10 fail lint — refactor
  (extract helpers, early returns, lookup tables) rather than raise the limit.

## Quick checks before "done"

```
yarn typecheck
yarn lint
yarn test
```

For UI work: also run `yarn dev`, open the changed feature in browser, exercise golden path + one edge case.
