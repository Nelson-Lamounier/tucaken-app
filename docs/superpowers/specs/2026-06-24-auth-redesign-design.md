# Auth (Sign in / Sign up) Redesign — Two-Column Split

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan
**Scope:** The auth surface at `/sign-in` (which serves both sign-in and sign-up). Layout, brand panel, and motion only. The Cognito flow, callback contract, sub-forms, and copy semantics are preserved.

## Goal

Redesign the auth surface as a **two-column split**: a branded panel (logo +
value-prop + the real founder quote, over an animated teal `FloatingPaths`
backdrop) on the left, and the existing auth card (tab pill + the full five-view
flow) on the right. Keep the teal + dark-zinc palette. Preserve all
functionality.

## Non-goals

- No change to the auth **flow or contract**: the `AuthShell` `View` state
  machine (`signin`/`signup`/`forgot`/`otp`/`verify`), every `onX` callback, the
  tab-pill `LayoutGroup`, the `AnimatePresence` view block, and error state stay
  byte-equivalent. They move into the right column unchanged.
- No change to the route: `/sign-in` keeps serving both sign-in and sign-up via
  the pill. `/login` keeps redirecting to `/sign-in`. No second route is added.
- No change to `sign-in.tsx`, `EnergeticAuthShell`, or any sub-form
  (`SignInForm`, `SignUpForm`, `ForgotPasswordForm`, `OtpForm`,
  `VerifyEmailScreen`, `SocialButtons`, `AuthInput`, `PasswordField`).
- The pasted `auth-page.tsx`, `shadcn/button`, `shadcn/input` are **reference
  only**. Their tokens (`bg-muted`, `text-primary`, `bg-background`) and the
  email magic-link + Apple provider do not exist in this repo (Cognito provides
  Google + GitHub; auth is password + MFA). Nothing is dropped in.
- No `framer-motion`. All animation stays on `motion/react`.

## Context (current state)

- Route `src/app/sign-in.tsx` validates `?callbackUrl`, wires all Cognito server
  fns, and renders `<EnergeticAuthShell {...callbacks} />`.
  `EnergeticAuthShell` = `<AuthShell variant="energetic" {...} />`.
- `src/features/auth/components/AuthShell.tsx` (189 lines) holds the whole UI:
  a centred glass card over a full-screen `AuthBackground`, a tab pill for
  `signin`/`signup`, and an `AnimatePresence mode="wait"` block rendering the
  five views. Props (the contract to preserve):
  `onSignIn` (returns `'otp'` for MFA), `onSignUp`, `onConfirmSignUp`,
  `onResendCode`, `onOtp`, `onRequestPasswordCode`, `onConfirmPassword`,
  `onGoogle`, `onGithub`, plus `variant`, `initial`, `brand`.
- `AuthBackground.tsx` has three variants (safe blobs / energetic mesh /
  experimental particles), all teal, all `motion/react`.
- Authentic copy lives in `src/features/home/content.ts`: `founder.quote`,
  `founder.name` ("Nelson"), `founder.role` ("DevOps engineer · Dublin"),
  `hero.sub`.

## Architecture

### New components (`src/features/auth/components/`)

1. **`FloatingPaths.tsx`** — animated SVG line-paths backdrop, ported from the
   reference to `motion/react`.
   - Props: `{ position: number }` (1 or -1, mirrors the two stacked layers).
   - 36 paths generated from index; `stroke="currentColor"` so the parent sets
     teal via `text-*`. Animates `pathLength`/`pathOffset`/`opacity` on an
     infinite loop.
   - **Per-path duration derived from index** (e.g. `20 + (i % 10)`), NOT
     `Math.random()` — keeps Sonar `S2245` clear and render deterministic.
   - `useReducedMotion()` → when reduced, render the paths statically (no
     `animate`, no infinite transition). `willChange: 'opacity'` only.
   - What it does: decorative flowing-paths motion. How to use:
     `<FloatingPaths position={1} />`. Depends on: `motion/react`.

2. **`AuthBrandPanel.tsx`** — the left panel (desktop only, `hidden lg:flex`).
   - Dark teal surface, relative, `overflow-hidden`, full height.
   - Top: the Tucaken logo image
     `src/images/logo-horizontal-resume-flat-teal.png` (teal toucan + "TUCAKEN
     Resume" wordmark), imported via `@/images/...`. This same logo replaces the
     `ShieldCheck`+wordmark mark in the AuthShell card header too, for
     consistency. The logo's teal (~teal-600) matches the app accent, so the
     panel/card teal accents (FloatingPaths colour, radial wash) stay in the
     teal-400/500/600 range to harmonise with it. The asset is currently
     untracked in git and is committed as part of this work.
   - Two `FloatingPaths` layers (`position={1}` and `position={-1}`) absolutely
     positioned behind, inside a `text-teal-*` wrapper, with a
     `from-background`/zinc gradient overlay (`z-10`) for legibility.
   - Bottom (`z-10 mt-auto`): a value-prop line + the real founder quote
     (`founder.quote`) and attribution (`founder.name` · `founder.role`) read
     from `@/features/home/content`. No fabricated testimonial.
   - What it does: brand/proof panel. How to use: `<AuthBrandPanel />`. Depends
     on: `FloatingPaths`, `content.ts`, logo asset.

### Modified component

3. **`AuthShell.tsx`** — restructure ONLY the outer chrome.
   - Return becomes a two-column split:
     `<main class="relative min-h-screen lg:grid lg:grid-cols-2">`.
   - **Left column**: `<AuthBrandPanel />` (its own `hidden lg:flex`).
   - **Right column**: a relative, vertically-centred flex container holding,
     in order:
     - a "← Home" ghost link to `/` (top-left; from the reference's
       ChevronLeft → Home), using the repo `Button`/link styling;
     - the existing **card** — the mobile logo header, the tab-pill
       `LayoutGroup`, and the `AnimatePresence mode="wait"` five-view block —
       moved here VERBATIM (same `view` state, same callbacks, same error
       handling, same sub-form props);
     - the "Secured by AWS Cognito · SOC 2 Type II" footer line.
   - A subtle radial backdrop (adapted from the reference's `radial-gradient`
     stack, recoloured to teal/zinc tokens) sits behind the right column at
     `-z-10`.
   - `AuthBackground` is retained as the base/mobile layer behind everything so
     the mobile (single-column) view keeps its current backdrop.
   - The `variant`, `initial`, `brand` props and the `cardClass` logic stay.
     The card may be lightly restyled to sit well on the split, but its inner
     structure and the view machine are unchanged.

### Data flow (unchanged)

`sign-in.tsx` → `EnergeticAuthShell` → `AuthShell` (view machine) → sub-forms →
callbacks → Cognito server fns. The redesign touches only what wraps the view
machine.

## Responsive behaviour

- `≥ lg`: two columns — brand panel left, form right.
- `< lg`: single column — brand panel hidden; the mobile logo header + form show
  exactly as today. No horizontal overflow at 375px.

## Accessibility & motion

- `motion/react` only. `FloatingPaths`, the brand-panel motion, and any new
  card animation freeze under `prefers-reduced-motion` via `useReducedMotion()`.
- Animate only `transform`/`opacity`/`clipPath`/`filter` with matching
  `willChange`.
- The brand panel is decorative; the form column remains the single source of
  interactive content and is fully usable on its own (mobile parity).
- Keep focus order sensible: "← Home" link, then tabs, then form fields.

## Code constraints (from CLAUDE.md)

- Teal accent + zinc only; no shadcn token set; `cn` from `@/lib/utils`.
- Sonar/ESLint: no nested ternaries (guard clauses), stable React keys (path
  `id`/index is fine for the static SVG list), **no `Math.random` for anything**,
  complexity ≤ 10, no `console.*`.
- UK English; product "Tucaken"; `resume` (no diacritics).
- New chrome uses `rounded-md`; existing card radius (`rounded-3xl`) kept.
- `"use client"` first line in every client component.

## Testing & verification

- `yarn typecheck && yarn lint && yarn test` green. Any existing auth tests must
  stay green (the contract is unchanged) — adapt a test only if a structural
  change genuinely requires it, and document why.
- New pure logic is minimal; `FloatingPaths` path generation can have a small
  unit test (e.g. it returns 36 path descriptors) under `src/__tests__/`.
- Manual: `yarn dev` (5001), open `/sign-in`. Verify on desktop (split) and
  mobile (single column): tab switch signin↔signup, password sign-in → OTP view,
  sign-up → verify-email view, forgot-password flow, Google/GitHub buttons fire,
  "← Home" navigates to `/`. Force `prefers-reduced-motion` and confirm
  FloatingPaths and panel motion freeze and the page stays usable.

## Build order (high level — detailed plan follows in writing-plans)

1. `FloatingPaths` (+ small unit test, reduced-motion path).
2. `AuthBrandPanel` (logo + copy + FloatingPaths).
3. `AuthShell` outer-layout refactor to the two-column split (view machine moved
   verbatim), "← Home" link, right-column backdrop.
4. Reduced-motion + responsive + a11y pass; typecheck/lint/test; manual QA.
