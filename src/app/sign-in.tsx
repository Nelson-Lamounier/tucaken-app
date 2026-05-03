"use client"
import { createFileRoute } from '@tanstack/react-router'
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

export const Route = createFileRoute('/sign-in')({
  component: AuthPage,
})

function navigate(isNewUser: boolean) {
  globalThis.window.location.href = isNewUser ? '/onboarding' : '/overview'
}

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
        navigate(result.isNewUser)
      }}
      onOtp={async (code) => {
        await respondToMfaChallengeFn({ data: { code } })
        globalThis.window.location.href = '/overview'
      }}
      onSignUp={async (v) => {
        await signUpFn({ data: { email: v.email, password: v.password, name: v.name } })
      }}
      onConfirmSignUp={async (email, code, password) => {
        const result = await confirmSignUpFn({ data: { email, code, password } })
        navigate(result.isNewUser)
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
  )
}
