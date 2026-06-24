"use client"
// src/features/auth/components/AuthShell.tsx
import { useState, useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, LayoutGroup, useReducedMotion } from 'motion/react'
import { ChevronLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AuthBrandPanel } from './AuthBrandPanel'

/**
 * Smoothly animates its own height to fit the active child. Used to wrap the
 * sign-in/sign-up form swap so switching tabs tweens the card height (no scale
 * distortion, no spring overshoot) — only the form area resizes, and the rest
 * of the card stays put. A ResizeObserver tracks the measured content height.
 */
function AnimateHeight({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const reduce = useReducedMotion() ?? false

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      style={{ overflow: 'hidden' }}
    >
      <div ref={innerRef} className="relative">
        {children}
      </div>
    </motion.div>
  )
}
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
    <main className="relative h-screen w-full overflow-hidden bg-zinc-950 lg:grid lg:grid-cols-2">
      <AuthBrandPanel />

      {/* Form column — flat background, no effect (effect lives only on the brand panel).
          Fixed to the viewport height; the card is compact enough to fit without
          the page ever growing or the card scrolling. */}
      <div className="relative flex h-screen flex-col items-center justify-center px-4 py-6">
        <Link
          to="/"
          className="absolute left-5 top-6 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="size-4" />
          Home
        </Link>

        <div className="w-full max-w-lg">
          <div
            className={[
              'relative isolate rounded-2xl border p-5 shadow-2xl shadow-black/10 backdrop-blur-xl',
              'dark:shadow-black/40',
              cardClass,
            ].join(' ')}
          >
            {/* Brand header */}
            <div className="mb-4 flex items-center gap-3">
              {brand ?? <img src={logoTeal} alt="Tucaken Resume" className="h-8 w-auto" />}
            </div>

            {/* Tab indicator (only for signin/signup) */}
            {(view === 'signin' || view === 'signup') && (
              <LayoutGroup id="auth-tabs">
                <div className="mb-4 flex rounded-xl border border-zinc-200/70 bg-zinc-100/60 p-1 text-sm font-medium dark:border-white/10 dark:bg-white/5">
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

            <AnimateHeight>
              <AnimatePresence mode="popLayout" initial={false}>
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
            </AnimateHeight>
          </div>

          <p className="mt-6 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            Secured by AWS Cognito &middot; SOC 2 Type II
          </p>
        </div>
      </div>
    </main>
  )
}
