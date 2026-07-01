"use client"
// src/features/auth/components/SignUpForm.tsx
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { motion } from 'motion/react'
import { Mail, User, Lock, ArrowRight } from 'lucide-react'
import { AuthInput } from './AuthInput'
import { PasswordField } from './PasswordField'
import { SocialButtons, SocialDivider } from './SocialButtons'
import { signUpSchema } from '../validation'

interface SignUpFormProps {
  onSwitchToSignIn: () => void
  onSubmit?: (values: {
    name: string
    email: string
    password: string
    accept: boolean
    marketing?: boolean
  }) => Promise<void>
  onGoogle: () => void | Promise<void>
  onGithub: () => void | Promise<void>
  error?: string | null
  /** True when the error is specifically a duplicate-account collision. */
  accountExists?: boolean
}

export function SignUpForm({ onSwitchToSignIn, onSubmit, onGoogle, onGithub, error, accountExists }: SignUpFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', confirm: '', accept: false, marketing: true },
    validators: { onChange: signUpSchema as never },
    onSubmit: async ({ value }) => {
      setSubmitting(true)
      try {
        await onSubmit?.(value as never)
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
      className="space-y-4"
      style={{ willChange: 'transform, opacity' }}
    >
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Create your account
        </h2>
      </header>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400"
        >
          {accountExists ? (
            <div className="flex items-center justify-between gap-3">
              <span>An account with this email already exists.</span>
              <button
                type="button"
                onClick={onSwitchToSignIn}
                className="shrink-0 rounded-lg bg-red-400/20 px-3 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-400/30"
              >
                Sign in instead
              </button>
            </div>
          ) : (
            error
          )}
        </motion.div>
      )}

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

      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-2.5"
      >
        <form.Field
          name="name"
          children={(field) => (
            <AuthInput label="Full name" field={field} icon={<User className="h-4 w-4" />} autoComplete="name" />
          )}
        />
        <form.Field
          name="email"
          children={(field) => (
            <AuthInput label="Email" field={field} icon={<Mail className="h-4 w-4" />} autoComplete="email" type="email" />
          )}
        />
        <form.Field name="password" children={(field) => <PasswordField field={field} showChecklist={false} />} />
        <form.Field
          name="confirm"
          children={(field) => (
            <AuthInput
              label="Confirm password"
              field={field}
              icon={<Lock className="h-4 w-4" />}
              autoComplete="new-password"
              type="password"
            />
          )}
        />

        <form.Field
          name="accept"
          children={(field) => (
            <label className="flex cursor-pointer items-start gap-2 pt-1 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
                className="peer sr-only"
              />
              <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded border border-zinc-300 bg-white transition-colors peer-checked:border-teal-500 peer-checked:bg-teal-500 dark:border-zinc-600 dark:bg-zinc-900">
                <svg viewBox="0 0 20 20" className="h-3 w-3 fill-white opacity-0 transition-opacity peer-checked:opacity-100">
                  <path d="M7.5 13.5l-3-3 1-1 2 2 5-5 1 1z" />
                </svg>
              </span>
              <span>
                I agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  Terms &amp; Conditions
                </a>{' '}
                and{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>
          )}
        />

        <form.Field
          name="marketing"
          children={(field) => (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
                className="peer sr-only"
              />
              <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded border border-zinc-300 bg-white transition-colors peer-checked:border-teal-500 peer-checked:bg-teal-500 dark:border-zinc-600 dark:bg-zinc-900">
                <svg viewBox="0 0 20 20" className="h-3 w-3 fill-white opacity-0 transition-opacity peer-checked:opacity-100">
                  <path d="M7.5 13.5l-3-3 1-1 2 2 5-5 1 1z" />
                </svg>
              </span>
              Send me product updates and tips. (Optional)
            </label>
          )}
        />

        <form.Subscribe
          selector={(s) => [s.canSubmit] as const}
          children={([canSubmit]) => (
            <motion.button
              type="submit"
              disabled={!canSubmit || submitting}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="group relative mt-2 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-shadow hover:shadow-xl hover:shadow-teal-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ willChange: 'transform' }}
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <>
                  <span className="relative">Create account</span>
                  <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </motion.button>
          )}
        />
      </form>

      <p className="pt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Already have an account?{' '}
        <button onClick={onSwitchToSignIn} className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400">
          Sign in
        </button>
      </p>
    </motion.div>
  )
}
