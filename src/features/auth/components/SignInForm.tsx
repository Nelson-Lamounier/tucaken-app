"use client"
// src/features/auth/components/SignInForm.tsx
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { motion } from 'motion/react'
import { Mail, ArrowRight } from 'lucide-react'
import { AuthInput } from './AuthInput'
import { PasswordField } from './PasswordField'
import { SocialButtons, SocialDivider } from './SocialButtons'
import { signInSchema } from '../validation'

interface SignInFormProps {
  onSwitchToSignUp: () => void
  onForgot: () => void
  onSubmit?: (values: { email: string; password: string; remember: boolean }) => Promise<void>
  onGoogle: () => void | Promise<void>
  onGithub: () => void | Promise<void>
  error?: string | null
}

export function SignInForm({ onSwitchToSignUp, onForgot, onSubmit, onGoogle, onGithub, error }: SignInFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)

  const form = useForm({
    defaultValues: { email: '', password: '', remember: true },
    validators: { onChange: signInSchema as never },
    onSubmit: async ({ value }) => {
      setSubmitting(true)
      try {
        await onSubmit?.(value as { email: string; password: string; remember: boolean })
      } finally {
        setSubmitting(false)
      }
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-5"
      style={{ willChange: 'transform, opacity' }}
    >
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Welcome back
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to continue to your dashboard.
        </p>
      </header>

      <SocialButtons
        onGoogle={async () => {
          setOauthLoading('google')
          try { await onGoogle() } finally { setOauthLoading(null) }
        }}
        onGithub={async () => {
          setOauthLoading('github')
          try { await onGithub() } finally { setOauthLoading(null) }
        }}
        loading={oauthLoading}
      />
      <SocialDivider />

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </motion.div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-3"
      >
        <form.Field
          name="email"
          children={(field) => (
            <AuthInput
              label="Email"
              field={field}
              icon={<Mail className="h-4 w-4" />}
              autoComplete="email"
              type="email"
            />
          )}
        />

        <form.Field name="password" children={(field) => <PasswordField field={field} showChecklist={false} showStrength={false} />} />

        <div className="flex items-center justify-between pt-1 text-xs">
          <form.Field
            name="remember"
            children={(field) => (
              <label className="inline-flex cursor-pointer select-none items-center gap-2 text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="relative h-4 w-7 rounded-full bg-zinc-300 transition-colors peer-checked:bg-teal-500 dark:bg-zinc-700">
                  <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform peer-checked:translate-x-3" />
                </span>
                Remember me
              </label>
            )}
          />
          <button type="button" onClick={onForgot} className="font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400">
            Forgot password?
          </button>
        </div>

        <form.Subscribe
          selector={(s) => [s.canSubmit, s.isSubmitting] as const}
          children={([canSubmit]) => (
            <motion.button
              type="submit"
              disabled={!canSubmit || submitting}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="group relative mt-2 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-shadow hover:shadow-xl hover:shadow-teal-500/30 disabled:opacity-60"
              style={{ willChange: 'transform' }}
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <>
                  <span className="relative">Sign in</span>
                  <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </motion.button>
          )}
        />
      </form>

      <p className="pt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Don&apos;t have an account?{' '}
        <button onClick={onSwitchToSignUp} className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400">
          Create one
        </button>
      </p>
    </motion.div>
  )
}
