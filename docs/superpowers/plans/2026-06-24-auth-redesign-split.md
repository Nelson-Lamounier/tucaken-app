# Auth Redesign (Two-Column Split) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `/sign-in` auth surface as a two-column split — a teal `FloatingPaths` brand panel on the left, the existing five-view Cognito flow on the right — keeping all functionality and the teal palette.

**Architecture:** Add `FloatingPaths` (animated SVG backdrop) and `AuthBrandPanel` (logo + founder quote + FloatingPaths). Refactor only the OUTER chrome of `AuthShell` from a centred card into a `lg:grid lg:grid-cols-2` split; the `View` state machine, all `onX` callbacks, the tab pill, the `AnimatePresence` view block, and every sub-form move into the right column verbatim. Route, `EnergeticAuthShell`, and sub-forms are untouched.

**Tech Stack:** React 19, `motion/react` (never `framer-motion`), `@tanstack/react-router` (`Link`), `lucide-react`, Tailwind v4, Vitest (node env), `cn` from `@/lib/utils`.

## Global Constraints

- Animation imports from `motion/react` only — never `framer-motion`. Animate only `transform`/`opacity`/`clipPath`/`filter` with matching `willChange`; never read a MotionValue in render.
- Every new animation has a reduced-motion path via `useReducedMotion()`.
- **No `Math.random()` anywhere** (the reference uses it for animation duration — replace with an index-derived value). Sonar `S2245`.
- Teal accent + zinc only; no shadcn token set; `cn` from `@/lib/utils`.
- Preserve the auth contract: `AuthShell`'s props (`onSignIn` returns `'otp'` for MFA, `onSignUp`, `onConfirmSignUp`, `onResendCode`, `onOtp`, `onRequestPasswordCode`, `onConfirmPassword`, `onGoogle`, `onGithub`, `variant`, `initial`, `brand`) and the five-view machine stay byte-equivalent. Social = Google + GitHub only (no Apple).
- `"use client"` is the first line of every client component.
- Sonar/ESLint: no nested ternaries (guard clauses), stable React keys, complexity ≤ 10, no `console.*`.
- UK English; product "Tucaken"; `resume` (no diacritics). New chrome uses `rounded-md`; existing card `rounded-3xl` kept.
- **Logo:** the brand panel AND the card header use the Tucaken logo image `src/images/logo-horizontal-resume-flat-teal.png` (imported as `@/images/logo-horizontal-resume-flat-teal.png`), replacing the old `ShieldCheck`+wordmark. The asset is currently untracked in git — commit it with the task that first imports it (Task 2). Its teal (~teal-600) matches the accent; keep FloatingPaths/wash in the teal-400/500/600 range to harmonise.
- Yarn 4: `yarn typecheck`, `yarn lint`, `yarn test` (never npm/npx). Tests live under `src/__tests__/**`, node env, vitest globals OFF — test files must `import { describe, it, expect } from 'vitest'`.
- Before "done": `yarn typecheck && yarn lint && yarn test` all green.

---

### Task 1: `FloatingPaths` backdrop + path builder

**Files:**
- Create: `src/features/auth/components/floating-paths-util.ts` (pure helper)
- Create: `src/features/auth/components/FloatingPaths.tsx`
- Test: `src/__tests__/features/auth/floating-paths-util.test.ts`

**Interfaces:**
- Produces: `buildFloatingPaths(position: number): Array<{ id: number; d: string; width: number; opacity: number }>` (36 entries); `FloatingPaths` component with props `{ position: number }`.
- Consumes: `motion`, `useReducedMotion` from `motion/react`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/auth/floating-paths-util.test.ts
import { describe, it, expect } from 'vitest'
import { buildFloatingPaths } from '@/features/auth/components/floating-paths-util'

describe('buildFloatingPaths', () => {
  it('returns 36 deterministic path descriptors', () => {
    const a = buildFloatingPaths(1)
    expect(a).toHaveLength(36)
    expect(buildFloatingPaths(1)).toEqual(a) // deterministic, no Math.random
  })

  it('encodes the position into the path data and ids', () => {
    expect(buildFloatingPaths(1)[0].id).toBe(0)
    expect(buildFloatingPaths(1)[0].d).not.toEqual(buildFloatingPaths(-1)[0].d)
  })

  it('width and opacity grow with index', () => {
    const p = buildFloatingPaths(1)
    expect(p[10].width).toBeGreaterThan(p[0].width)
    expect(p[10].opacity).toBeGreaterThan(p[0].opacity)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/auth/floating-paths-util.test.ts`
Expected: FAIL — cannot resolve `floating-paths-util`.

- [ ] **Step 3: Write the pure helper**

```ts
// src/features/auth/components/floating-paths-util.ts
// Deterministic flowing-path descriptors for the auth brand panel. No
// Math.random — duration/jitter in the component derive from the index too,
// so renders are stable (and Sonar S2245 stays clear).
export interface FloatingPath {
  id: number
  d: string
  width: number
  opacity: number
}

export function buildFloatingPaths(position: number): FloatingPath[] {
  const paths: FloatingPath[] = []
  for (let i = 0; i < 36; i++) {
    paths.push({
      id: i,
      d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
      width: 0.5 + i * 0.03,
      opacity: 0.1 + i * 0.03,
    })
  }
  return paths
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/auth/floating-paths-util.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the `FloatingPaths` component**

```tsx
// src/features/auth/components/FloatingPaths.tsx
"use client"
// Animated flowing-line backdrop for the auth brand panel. Ported from a
// framer-motion reference to motion/react. stroke=currentColor so the parent
// sets the colour via a text-* class. Per-path duration derives from the index
// (no Math.random). Frozen under prefers-reduced-motion.
import { motion, useReducedMotion } from 'motion/react'
import { buildFloatingPaths } from './floating-paths-util'

export function FloatingPaths({ position }: { position: number }) {
  const reduce = useReducedMotion() ?? false
  const paths = buildFloatingPaths(position)

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full" viewBox="0 0 696 316" fill="none">
        <title>Background paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            style={{ willChange: 'opacity' }}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={
              reduce
                ? undefined
                : { pathLength: 1, opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }
            }
            transition={
              reduce
                ? undefined
                : { duration: 20 + (path.id % 10), repeat: Infinity, ease: 'linear' }
            }
          />
        ))}
      </svg>
    </div>
  )
}
```

- [ ] **Step 6: Verify typecheck + lint + full test**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: zero errors; all tests pass.

- [ ] **Step 7: Commit** [git-commit skill]

```bash
git add src/features/auth/components/floating-paths-util.ts src/features/auth/components/FloatingPaths.tsx src/__tests__/features/auth/floating-paths-util.test.ts
git commit -m "feat(auth): add FloatingPaths animated backdrop"
```

---

### Task 2: `AuthBrandPanel`

**Files:**
- Create: `src/features/auth/components/AuthBrandPanel.tsx`

**Interfaces:**
- Consumes: `FloatingPaths` (Task 1), the logo image `@/images/logo-horizontal-resume-flat-teal.png`, `founder` from `@/features/home/content`.
- Produces: `AuthBrandPanel` component (no props), the left split column.

- [ ] **Step 1: Confirm the founder copy exists**

Run: `grep -n "founder" src/features/home/content.ts`
Expected: an `export const founder = { name: 'Nelson', role: 'DevOps engineer · Dublin', quote: '…' }`. (Used read-only; do not edit content.ts.)

- [ ] **Step 2: Write the component**

```tsx
// src/features/auth/components/AuthBrandPanel.tsx
"use client"
// Left split column (desktop only): Tucaken logo + founder quote over the
// FloatingPaths backdrop.
import { FloatingPaths } from './FloatingPaths'
import { founder } from '@/features/home/content'
import logoTeal from '@/images/logo-horizontal-resume-flat-teal.png'

export function AuthBrandPanel() {
  return (
    <div className="relative hidden h-full flex-col overflow-hidden border-r border-white/10 bg-zinc-950 p-10 lg:flex">
      {/* FloatingPaths inherit teal via the text colour here */}
      <div className="absolute inset-0 text-teal-400/40">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>
      <div className="absolute inset-0 z-10 bg-linear-to-t from-zinc-950 via-zinc-950/70 to-transparent" />

      <div className="z-10">
        <img src={logoTeal} alt="Tucaken Resume" className="h-10 w-auto" />
      </div>

      <div className="z-10 mt-auto max-w-md">
        <blockquote className="space-y-3">
          <p className="text-pretty text-lg leading-relaxed text-zinc-100">
            &ldquo;{founder.quote}&rdquo;
          </p>
          <footer className="font-mono text-sm text-zinc-400">
            ~ {founder.name} &middot; {founder.role}
          </footer>
        </blockquote>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors. (`founder` is an existing export; if `@/features/home/content` is unexpectedly absent, STOP and report — do not invent copy. The png import needs no type shim — Vite handles it via the app's image module typing.)

- [ ] **Step 4: Commit** [git-commit skill]

Stage the panel AND the logo asset (currently untracked):

```bash
git add src/features/auth/components/AuthBrandPanel.tsx src/images/logo-horizontal-resume-flat-teal.png
git commit -m "feat(auth): add AuthBrandPanel with logo and founder quote"
```

---

### Task 3: `AuthShell` two-column split refactor

**Files:**
- Modify: `src/features/auth/components/AuthShell.tsx` (outer chrome only)

**Interfaces:**
- Consumes: `AuthBrandPanel` (Task 2), `Link` from `@tanstack/react-router`, `ChevronLeft` from `lucide-react`, the logo image `@/images/logo-horizontal-resume-flat-teal.png`. The `AuthShellProps` interface and the entire `view`/callback machine are unchanged.
- Produces: the redesigned `AuthShell` (same public API).

- [ ] **Step 1: Replace the whole file**

Replace `src/features/auth/components/AuthShell.tsx` with the following. The `AuthShellProps` interface, the `useState`/`useEffect` state, `cardClass`, the tab-pill `LayoutGroup`, and the entire `AnimatePresence` block are byte-identical to the current file — the outer `return` wrapper changes from a single centred card to a two-column split, the card-header `ShieldCheck`+wordmark is replaced by the logo image, and a "← Home" link is added.

```tsx
"use client"
// src/features/auth/components/AuthShell.tsx
import { useState, useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion, LayoutGroup } from 'motion/react'
import { ChevronLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AuthBackground } from './AuthBackground'
import { AuthBrandPanel } from './AuthBrandPanel'
import logoTeal from '@/images/logo-horizontal-resume-flat-teal.png'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { OtpForm } from './OtpForm'
import { VerifyEmailScreen } from './VerifyEmailScreen'

type View = 'signin' | 'signup' | 'forgot' | 'otp' | 'verify'

interface AuthShellProps {
  variant?: 'safe' | 'energetic' | 'experimental'
  initial?: 'signin' | 'signup'
  /** Return 'otp' to trigger MFA view, throw to show an error banner */
  onSignIn?: (v: { email: string; password: string }) => Promise<'otp' | void>
  onSignUp?: (v: { email: string; name: string; password: string }) => Promise<void>
  /** Called with the 6-digit code after sign-up — should sign the user in and resolve */
  onConfirmSignUp?: (email: string, code: string, password: string) => Promise<void>
  onResendCode?: (email: string) => Promise<void>
  onOtp?: (code: string) => Promise<void>
  onRequestPasswordCode?: (email: string) => Promise<void>
  onConfirmPassword?: (email: string, code: string, newPassword: string) => Promise<void>
  onGoogle: () => void | Promise<void>
  onGithub: () => void | Promise<void>
  brand?: ReactNode
}

export function AuthShell({
  variant = 'safe',
  initial = 'signin',
  onSignIn,
  onSignUp,
  onConfirmSignUp,
  onResendCode,
  onOtp,
  onRequestPasswordCode,
  onConfirmPassword,
  onGoogle,
  onGithub,
  brand,
}: AuthShellProps) {
  const [view, setView] = useState<View>(initial)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signInError, setSignInError] = useState<string | null>(null)
  const [signUpError, setSignUpError] = useState<string | null>(null)

  useEffect(() => {
    setSignInError(null)
    setSignUpError(null)
  }, [view])

  const cardClass =
    variant === 'safe'
      ? 'bg-white/80 dark:bg-zinc-900/70 border-zinc-200/80 dark:border-white/10'
      : variant === 'energetic'
        ? 'bg-white/10 border-white/15 text-zinc-100'
        : 'bg-zinc-950/60 border-white/10 text-zinc-100'

  return (
    <main className="relative min-h-screen w-full overflow-hidden lg:grid lg:grid-cols-2">
      <AuthBackground variant={variant} />
      <AuthBrandPanel />

      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
        {/* Right-column radial wash (teal), behind the card */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        >
          <div className="absolute right-0 top-0 h-160 w-88 -translate-y-1/3 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,oklch(0.72_0.14_175/0.12),transparent_80%)]" />
        </div>

        <Link
          to="/"
          className="absolute left-5 top-6 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="size-4" />
          Home
        </Link>

        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={[
              'relative overflow-hidden rounded-3xl border p-7 shadow-2xl shadow-black/10 backdrop-blur-xl',
              'dark:shadow-black/40',
              cardClass,
            ].join(' ')}
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Brand header */}
            <div className="mb-6 flex items-center gap-3">
              {brand ?? <img src={logoTeal} alt="Tucaken Resume" className="h-8 w-auto" />}
            </div>

            {/* Tab indicator (only for signin/signup) */}
            {(view === 'signin' || view === 'signup') && (
              <LayoutGroup id="auth-tabs">
                <div className="mb-6 flex rounded-xl border border-zinc-200/70 bg-zinc-100/60 p-1 text-sm font-medium dark:border-white/10 dark:bg-white/5">
                  {(['signin', 'signup'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={[
                        'relative flex-1 rounded-lg py-2 transition-colors',
                        view === v
                          ? 'text-zinc-900 dark:text-white'
                          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
                      ].join(' ')}
                    >
                      {view === v && (
                        <motion.span
                          layoutId="auth-tab-pill"
                          className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-zinc-800"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          style={{ willChange: 'transform' }}
                        />
                      )}
                      <span className="relative">{v === 'signin' ? 'Sign in' : 'Sign up'}</span>
                    </button>
                  ))}
                </div>
              </LayoutGroup>
            )}

            <AnimatePresence mode="wait">
              {view === 'signin' && (
                <SignInForm
                  key="signin"
                  onSwitchToSignUp={() => setView('signup')}
                  onForgot={() => setView('forgot')}
                  error={signInError}
                  onSubmit={async (v) => {
                    setSignInError(null)
                    setEmail(v.email)
                    try {
                      const next = await onSignIn?.(v)
                      if (next === 'otp') setView('otp')
                    } catch (err) {
                      setSignInError(err instanceof Error ? err.message : 'Sign in failed')
                    }
                  }}
                  onGoogle={onGoogle}
                  onGithub={onGithub}
                />
              )}
              {view === 'signup' && (
                <SignUpForm
                  key="signup"
                  onSwitchToSignIn={() => setView('signin')}
                  error={signUpError}
                  accountExists={signUpError?.toLowerCase().includes('already exists') ?? false}
                  onSubmit={async (v) => {
                    setSignUpError(null)
                    setEmail(v.email)
                    setPassword(v.password)
                    try {
                      await onSignUp?.(v)
                      setView('verify')
                    } catch (err) {
                      setSignUpError(err instanceof Error ? err.message : 'Sign-up failed')
                    }
                  }}
                  onGoogle={onGoogle}
                  onGithub={onGithub}
                />
              )}
              {view === 'forgot' && (
                <ForgotPasswordForm
                  key="forgot"
                  onBack={() => setView('signin')}
                  onRequestCode={onRequestPasswordCode}
                  onConfirm={onConfirmPassword}
                />
              )}
              {view === 'otp' && <OtpForm key="otp" onBack={() => setView('signin')} onSubmit={onOtp} />}
              {view === 'verify' && (
                <VerifyEmailScreen
                  key="verify"
                  email={email}
                  onBack={() => setView('signup')}
                  onResend={() => onResendCode?.(email)}
                  onConfirm={(code) => onConfirmSignUp?.(email, code, password) ?? Promise.resolve()}
                />
              )}
            </AnimatePresence>
          </motion.div>

          <p className="mt-6 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            Secured by AWS Cognito &middot; SOC 2 Type II
          </p>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify typecheck + lint + full test**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: zero errors; all tests pass (no auth-component tests exist; `server/auth.test.ts` is unaffected).

- [ ] **Step 3: Manual QA**

Run: `yarn dev` → open http://localhost:5001/sign-in.
- Desktop (≥1024px): two columns — brand panel left with drifting teal paths + founder quote; auth card right; "← Home" top-left navigates to `/`.
- Tab switch Sign in ↔ Sign up animates the pill; sign-up → verify-email view; a sign-in that returns `'otp'` → OTP view; "Forgot password" → forgot view; Google/GitHub buttons fire their handlers.
- Mobile (375px): single column — brand panel hidden, card centred, no horizontal overflow.
- Force `prefers-reduced-motion: reduce` (DevTools → Rendering): FloatingPaths and card entrance freeze; page fully usable.

- [ ] **Step 4: Commit** [git-commit skill]

```bash
git add src/features/auth/components/AuthShell.tsx
git commit -m "feat(auth): two-column split layout with brand panel"
```

---

## Self-Review notes

- **Spec coverage:** FloatingPaths (Task 1), AuthBrandPanel (Task 2), AuthShell split + Home link + right-column wash (Task 3). Responsive (`hidden lg:flex` panel, `lg:grid-cols-2`), reduced motion (`useReducedMotion` in FloatingPaths; card entrance is a one-shot that Motion's reduced-motion handling on transform covers — and is opacity+y only), and the preserved contract (interface + view machine reproduced verbatim) are all addressed.
- **No `Math.random`:** the reference's `Math.random()` duration is replaced by `20 + (path.id % 10)`.
- **Type consistency:** `buildFloatingPaths` / `FloatingPath` / `FloatingPaths` / `AuthBrandPanel` names are used identically across tasks. `AuthShellProps` is unchanged from the current file.
- **No Apple provider; magic-link dropped** — Task 3 keeps only Google/GitHub via the existing sub-forms; nothing from the reference's email-link UI is introduced.
- **Deferred:** the card itself is only lightly reframed (kept structure) — no sub-form restyling, per the non-goals.
