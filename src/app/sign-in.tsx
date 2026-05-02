"use client"
import { createFileRoute } from '@tanstack/react-router'
import { EnergeticAuthShell } from '../features/auth/components/EnergeticAuthShell'
import { getLoginUrlFn, signInWithPasswordFn, respondToMfaChallengeFn, forgotPasswordFn, confirmForgotPasswordFn } from '../server/auth'

export const Route = createFileRoute('/sign-in')({
  component: AuthPage,
})

function AuthPage() {
  const goOAuth = async (provider: 'Google' | 'GitHub') => {
    const url = await getLoginUrlFn({ data: { provider } })
    globalThis.window.location.href = url
  }

  return (
    <EnergeticAuthShell
      onGoogle={() => goOAuth('Google')}
      onGithub={() => goOAuth('GitHub')}
      onSignIn={async (v) => {
        const result = await signInWithPasswordFn({ data: v })
        if (!result.success) return 'otp'
        globalThis.window.location.href = '/overview'
      }}
      onOtp={async (code) => {
        await respondToMfaChallengeFn({ data: { code } })
        globalThis.window.location.href = '/overview'
      }}
      onRequestPasswordCode={async (email) => {
        await forgotPasswordFn({ data: { email } })
      }}
      onConfirmPassword={async (email, code, newPassword) => {
        await confirmForgotPasswordFn({ data: { email, code, newPassword } })
      }}
      onSignUp={async () => {
        const url = await getLoginUrlFn({ data: {} })
        globalThis.window.location.href = url
      }}
    />
  )
}
