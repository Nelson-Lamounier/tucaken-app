"use client"
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { EnergeticAuthShell } from '../features/auth/components/EnergeticAuthShell'
import {
  getLoginUrlFn,
  signInWithPasswordFn,
  signUpFn,
  confirmSignUpFn,
  resendConfirmationCodeFn,
  respondToMfaChallengeFn,
  forgotPasswordFn,
  confirmForgotPasswordFn,
} from '../server/auth'
import { withFormTracking } from '@/lib/observability/with-form-tracking'

export const Route = createFileRoute('/sign-in')({
  validateSearch: z.object({
    callbackUrl: z.string().optional(),
    /** Set by the global auth-failure handler so the page can explain the redirect. */
    reason: z.enum(['expired']).optional(),
  }),
  component: AuthPage,
})

function AuthPage() {
  const { callbackUrl, reason } = Route.useSearch()

  function navigateAfterAuth(isNewUser: boolean) {
    if (isNewUser) {
      globalThis.window.location.href = '/onboarding'
    } else {
      globalThis.window.location.href = callbackUrl ?? '/overview'
    }
  }

  const goOAuth = async (provider: 'Google' | 'GitHub') => {
    const url = await getLoginUrlFn({ data: { provider } })
    globalThis.window.location.href = url
  }

  return (
    <>
      {reason === 'expired' && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          Your session expired. Sign in again to pick up where you left off.
        </div>
      )}
      <EnergeticAuthShell
      onGoogle={() => goOAuth('Google')}
      onGithub={() => goOAuth('GitHub')}
      onSignIn={async (v) => {
        const result = await withFormTracking('sign_in', () =>
          signInWithPasswordFn({ data: v }),
        )
        if (!result.success) return 'otp'
        navigateAfterAuth(result.isNewUser)
      }}
      onOtp={async (code) => {
        await respondToMfaChallengeFn({ data: { code } })
        globalThis.window.location.href = callbackUrl ?? '/overview'
      }}
      onSignUp={async (v) => {
        await withFormTracking('sign_up', () =>
          signUpFn({ data: { email: v.email, password: v.password, name: v.name } }),
        )
        // Dev mock: no real email is sent, so skip the verify-code screen.
        if (import.meta.env.VITE_MOCK_AUTH === 'true') navigateAfterAuth(true)
      }}
      onConfirmSignUp={async (email, code, password) => {
        const result = await confirmSignUpFn({ data: { email, code, password } })
        navigateAfterAuth(result.isNewUser)
      }}
      onResendCode={async (email) => {
        await resendConfirmationCodeFn({ data: { email } })
      }}
      onRequestPasswordCode={async (email) => {
        await forgotPasswordFn({ data: { email } })
      }}
      onConfirmPassword={async (email, code, newPassword) => {
        await confirmForgotPasswordFn({ data: { email, code, newPassword } })
      }}
      />
    </>
  )
}
