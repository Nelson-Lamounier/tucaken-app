# Onboarding components for tucaken-app

These TSX files are written to drop into `tucaken-app/src/features/onboarding/`.
They implement the **first-run welcome flow** for new users — locked to the
direction selected from the canvas:

> **Variant B — Teal accent · Top stepper · Centered modal · Slide transitions · Warm tone.**

The flow has five steps:

| # | Name | Required? | Notes |
|---|---|---|---|
| 1 | Welcome | — | Auto-advancing 4-slide carousel + 3-step preview checklist |
| 2 | Portfolio | optional | Paste a URL, validates, shows live preview card |
| 3 | Resume | optional | File upload (PDF/DOCX) with parsed-summary preview |
| 4 | Connect | required | GitHub featured large; AWS / Figma show as "Coming soon" |
| 5 | Done → Dashboard | — | Smooth crossfade hand-off to the existing dashboard |

When step 5 completes, the user lands on the existing `OnboardingContainer` —
which is repurposed as the **management view** for already-onboarded users
(see `## Relationship to existing OnboardingContainer` below).

---

## Stack

Same conventions as the rest of the codebase:

- **`motion/react`** for animations (already a dep — see `auth/`)
- **`lucide-react`** for icons
- **`@tanstack/react-form` + `zod`** for the URL field and file picker
- **`@tanstack/react-router`** for the route + post-onboarding navigation
- **Tailwind v4** with the existing teal/emerald + zinc palette
- **`useTheme()`** from `src/contexts/ThemeContext.tsx` for dark/light parity

No new third-party dependencies are introduced.

---

## Files & destinations

| Source path here | Destination in tucaken-app |
|---|---|
| `onboarding/OnboardingShell.tsx` | `src/features/onboarding/components/OnboardingShell.tsx` |
| `onboarding/OnboardingProgress.tsx` | `src/features/onboarding/components/OnboardingProgress.tsx` |
| `onboarding/OnboardingBackground.tsx` | `src/features/onboarding/components/OnboardingBackground.tsx` |
| `onboarding/StepHeader.tsx` | `src/features/onboarding/components/StepHeader.tsx` |
| `onboarding/StepFooter.tsx` | `src/features/onboarding/components/StepFooter.tsx` |
| `onboarding/WelcomeStep.tsx` | `src/features/onboarding/components/WelcomeStep.tsx` |
| `onboarding/WelcomeCarousel.tsx` | `src/features/onboarding/components/WelcomeCarousel.tsx` |
| `onboarding/PortfolioStep.tsx` | `src/features/onboarding/components/PortfolioStep.tsx` |
| `onboarding/ResumeStep.tsx` | `src/features/onboarding/components/ResumeStep.tsx` |
| `onboarding/ConnectStep.tsx` | `src/features/onboarding/components/ConnectStep.tsx` |
| `onboarding/GitHubOAuthModal.tsx` | `src/features/onboarding/components/GitHubOAuthModal.tsx` |
| `onboarding/content.ts` | `src/features/onboarding/content.ts` |
| `onboarding/validation.ts` | `src/features/onboarding/validation.ts` |
| `onboarding/types.ts` | `src/features/onboarding/types.ts` |
| `onboarding/useOnboardingState.ts` | `src/features/onboarding/hooks/useOnboardingState.ts` |
| `onboarding/OnboardingPage.tsx` | `src/app/onboarding.tsx` (TanStack Router file route) |

---

## Relationship to existing `OnboardingContainer`

Per spec: the **new flow** is for **first-time users only**, while the existing
`OnboardingContainer` (Import Career → Connect Repos → Generate Resume) becomes
the **post-onboarding management view** for returning users.

Suggested route layout:

```
/onboarding         → new (this) — first-run, redirect target after sign-up
/dashboard          → existing OnboardingContainer, repurposed as management
```

Add a route guard in `src/app/__root.tsx` that redirects authenticated users
**without** an `onboardingCompletedAt` timestamp to `/onboarding`, and everyone
else to `/dashboard`. Once `OnboardingShell` calls its `onComplete` prop, it:

1. Calls a server fn to set `onboardingCompletedAt` on the user record
2. Routes the user to `/dashboard` via `useNavigate({ to: '/dashboard' })`

Both flows can share the same backend mutations
(`importPortfolio`, `parseResume`, `connectGitHub`) — the new flow just calls
them via a guided UI for first-timers.

---

## Wiring server functions

`OnboardingShell` accepts these props (all optional — falls back to mock
behaviour for local dev):

```ts
interface OnboardingShellProps {
  onSubmitPortfolio?: (url: string) => Promise<void>
  onUploadResume?: (file: File) => Promise<{ roles: number; education: number; skills: number }>
  onConnectGithub?: () => Promise<void>      // kicks off OAuth
  onComplete?: () => Promise<void> | void    // called after step 5
}
```

Reuse existing TanStack server fns in `src/server/`:

```ts
// onboarding.tsx route
<OnboardingShell
  onSubmitPortfolio={(url) => savePortfolioFn({ data: { url } })}
  onUploadResume={(file) => parseResumeFn({ data: { file } })}
  onConnectGithub={() => goSocial('GitHub')}      // existing helper from AuthPage
  onComplete={async () => {
    await markOnboardingCompleteFn()
    navigate({ to: '/dashboard' })
  }}
/>
```

---

## Notes

- **Skip behavior:** Portfolio + Resume steps have prominent "Skip · you can do this later" buttons (equal visual weight to Next, with reassurance copy). Connect is required.
- **Mobile:** All components are responsive. The top stepper collapses to a dot indicator below `md:`.
- **Dark mode:** Default dark, with light-mode tokens. The teal/emerald accent reads well on both.
- **Accessibility:** ARIA-labeled progress nav, focus management on step transitions, keyboard escape for the OAuth modal.
