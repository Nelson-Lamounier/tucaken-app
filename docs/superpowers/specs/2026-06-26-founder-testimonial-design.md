# Founder section → centred testimonial — design

Date: 2026-06-26
Branch: `feat/orbital-enhancements` (per user choice; unrelated to the orbital work — mixed-PR tradeoff surfaced and accepted)
Worktree: `../tucaken-app-wt-orbital-fx`

## Goal

Redesign `FounderSection` from a left-aligned bordered card into a clean,
centred **testimonial** (re-skinned from a pasted shadcn `Testimonial`), with
tasteful "Founder motion". No author image, no links.

## Current state

`FounderSection` (`src/features/home/sections/Sections.tsx`): a `Section` with an
`Eyebrow`, a bordered gradient card containing a pulsing "N" avatar + name/role
(top), a `motion.blockquote` quote reveal, and LinkedIn/GitHub placeholder links.
Data: `founder = { name: 'Nelson', role: 'DevOps engineer · Dublin', quote: '…' }`
in `src/features/home/content.ts`.

## Decisions

- **Centred testimonial layout**, no card, no image, no links.
- **Keep** the `Eyebrow` "Built by a user, for users" and the `Section` wrapper.
- **Copy edit:** change the FIRST mention in `founder.quote` from `Tucaken` to
  `Tucaken Resumes` (the rest of the quote keeps `Tucaken`). User-requested
  user-facing copy change (overrides the default "Tucaken" naming for this
  phrase).
- **Highlight** the phrase `Tucaken Resumes` in the quote — teal, `font-semibold`,
  `text-teal-300` — rendered with a JSX `<strong>` split, NOT
  `dangerouslySetInnerHTML`.
- Remove the avatar, top name/role block, links, and bordered card.

## Adaptations from the pasted component
- `next/image` removed — this is TanStack Start, not Next; no images here anyway.
- `dangerouslySetInnerHTML` removed — replaced by a pure split + `<strong>`.
- shadcn tokens (`text-foreground`, `text-muted-foreground`, `bg-muted`,
  `foreground/40`) → teal/zinc.
- No generic `components/ui/Testimonial` — used exactly once, so the layout is
  inlined into `FounderSection` (YAGNI; reuse-first says don't add a one-use
  primitive). `cn` from `@/lib/utils` is available if needed.

## Components / changes

### 1. Data — `content.ts`
Edit `founder.quote`: first `Tucaken` -> `Tucaken Resumes`. Exact new value:
```
'I built Tucaken Resumes because every resume tool I tried produced something that did not sound like me. I had years of real work in my GitHub that no tool could read. Tucaken is the tool I built for myself — I use it for my own job search every day.'
```

### 2. Pure helper — `highlightParts` (`src/features/home/lib/highlight.ts`)
```ts
export type HighlightPart = { text: string; highlight: boolean }
export function highlightParts(text: string, term: string): HighlightPart[]
```
- Splits `text` into ordered segments; segments equal to `term` get
  `highlight: true`, everything else `highlight: false`. Handles the term
  appearing 0, 1, or many times; empty `term` returns a single non-highlight
  segment. No regex injection risk (split on the literal term, not a built regex).

### 3. `FounderSection` rewrite (`Sections.tsx`)
- Keep `const reduce = useReducedMotion() ?? false`.
- Centred column: `Eyebrow` -> quote -> name -> role.
- Quote: `motion.blockquote`, `whileInView` reveal (opacity + `y`, `once`,
  reduced-motion-gated), `text-balance text-center text-xl sm:text-2xl text-zinc-100 max-w-2xl mx-auto`.
  Body = `highlightParts(founder.quote, 'Tucaken Resumes').map(...)` rendering
  `<strong className="font-semibold text-teal-300">` for highlighted parts, plain
  text otherwise, wrapped in surrounding quotation marks.
- Name: `motion`-revealed (small delay after quote), `mt-6 font-medium text-zinc-300`.
- Role: `mt-1.5 text-sm text-zinc-500`.
- `willChange` only transform/opacity; static under reduced motion (no `initial`/
  `whileInView` offsets).

## Constraints
- `motion/react` only; teal/zinc; no new deps; no `next/image`; no
  `dangerouslySetInnerHTML`; no nested ternaries; complexity <= 10; stable keys
  (segment index is acceptable for the static, non-reordering highlight parts —
  or use `${part.text}-${i}`); UK English; no `console.*`; no `as any`.

## Testing (Vitest, happy-dom + node)
- `highlightParts`: term once -> 3 parts (pre/term/post or fewer) with the right
  `highlight` flags; term twice -> highlights both; term absent -> single
  non-highlight part; empty term -> single non-highlight part.
- `FounderSection`: renders `founder.name`, `founder.role`, the quote text, and a
  `<strong>` containing `Tucaken Resumes`; reduced-motion renders without crashing.

## Out of scope
- No other sections; no new deps; no generic testimonial primitive; no real
  author photo (honesty — we will not put a stock face as the founder).

## Verification
- `yarn typecheck && yarn lint && yarn test` green.
- `yarn dev`: Founder section shows the centred quote with `Tucaken Resumes`
  bolded in teal, name + role below, reveal on scroll; reduced-motion static.
