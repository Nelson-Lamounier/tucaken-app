"use client"
// src/features/auth/components/ForgotPasswordForm.tsx
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { motion, AnimatePresence } from 'motion/react'
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Lock } from 'lucide-react'
import { z } from 'zod'
import { AuthInput } from './AuthInput'
import { PasswordField } from './PasswordField'
import { forgotSchema } from '../validation'

type Step = 'email' | 'reset' | 'done'

interface ForgotPasswordFormProps {
  onBack: () => void
  onRequestCode?: (email: string) => Promise<void>
  onConfirm?: (email: string, code: string, newPassword: string) => Promise<void>
}

export function ForgotPasswordForm({ onBack, onRequestCode, onConfirm }: ForgotPasswordFormProps) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="space-y-5"
      style={{ willChange: 'transform, opacity' }}
    >
      {step !== 'done' && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-teal-500 dark:text-zinc-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </button>
      )}

      <AnimatePresence mode="wait">
        {step === 'email' && (
          <EmailStep
            key="email"
            error={error}
            onSubmit={async (e) => {
              setError(null)
              setEmail(e)
              try {
                await onRequestCode?.(e)
                setStep('reset')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to send code')
              }
            }}
          />
        )}

        {step === 'reset' && (
          <ResetStep
            key="reset"
            email={email}
            error={error}
            onResend={async () => {
              setError(null)
              try { await onRequestCode?.(email) } catch { /* ignore */ }
            }}
            onSubmit={async (code, newPassword) => {
              setError(null)
              try {
                await onConfirm?.(email, code, newPassword)
                setStep('done')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Reset failed')
              }
            }}
          />
        )}

        {step === 'done' && <DoneStep key="done" onSignIn={onBack} />}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Step 1: Email ────────────────────────────────────────────────────────────

function EmailStep({
  error,
  onSubmit,
}: {
  error: string | null
  onSubmit: (email: string) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const form = useForm({
    defaultValues: { email: '' },
    validators: { onChange: forgotSchema },
    onSubmit: async ({ value }) => {
      setSubmitting(true)
      try { await onSubmit(value.email) } finally { setSubmitting(false) }
    },
  })

  return (
    <motion.div key="email-step" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Reset your password</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a 6-digit verification code.
        </p>
      </header>

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
        onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit() }}
        className="space-y-3"
      >
        <form.Field
          name="email"
          children={(field) => (
            <AuthInput label="Email" field={field} icon={<Mail className="h-4 w-4" />} type="email" autoComplete="email" />
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
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 disabled:opacity-60"
              style={{ willChange: 'transform' }}
            >
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <>Send code <ArrowRight className="h-4 w-4" /></>
              )}
            </motion.button>
          )}
        />
      </form>
    </motion.div>
  )
}

// ─── Step 2: Code + new password ──────────────────────────────────────────────

const resetSchema = z.object({
  code: z.string().length(6, 'Must be 6 digits').regex(/^\d+$/, 'Digits only'),
  newPassword: z.string().min(8, 'At least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.newPassword === d.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
})

function ResetStep({
  email,
  error,
  onResend,
  onSubmit,
}: {
  email: string
  error: string | null
  onResend: () => Promise<void>
  onSubmit: (code: string, newPassword: string) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  const form = useForm({
    defaultValues: { code: '', newPassword: '', confirm: '' },
    validators: { onChange: resetSchema as never },
    onSubmit: async ({ value }) => {
      setSubmitting(true)
      try { await onSubmit(value.code, value.newPassword) } finally { setSubmitting(false) }
    },
  })

  return (
    <motion.div key="reset-step" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Set new password</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Code sent to <span className="font-medium text-zinc-700 dark:text-zinc-200">{email}</span>.
        </p>
      </header>

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
        onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit() }}
        className="space-y-3"
      >
        <form.Field
          name="code"
          children={(field) => (
            <AuthInput
              label="6-digit code"
              field={field}
              icon={<KeyRound className="h-4 w-4" />}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          )}
        />
        <form.Field name="newPassword" children={(field) => <PasswordField field={field} label="New password" />} />
        <form.Field
          name="confirm"
          children={(field) => (
            <AuthInput
              label="Confirm new password"
              field={field}
              icon={<Lock className="h-4 w-4" />}
              type="password"
              autoComplete="new-password"
            />
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
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 disabled:opacity-60"
              style={{ willChange: 'transform' }}
            >
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <>Reset password <ArrowRight className="h-4 w-4" /></>
              )}
            </motion.button>
          )}
        />
      </form>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Didn&apos;t receive the code?{' '}
        <button
          type="button"
          disabled={resending}
          onClick={async () => {
            setResending(true)
            try { await onResend() } finally { setResending(false) }
          }}
          className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400 disabled:opacity-60"
        >
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </p>
    </motion.div>
  )
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function DoneStep({ onSignIn }: { onSignIn: () => void }) {
  return (
    <motion.div
      key="done-step"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-5 py-4 text-center"
      style={{ willChange: 'transform, opacity' }}
    >
      <motion.div
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500"
        style={{ willChange: 'transform' }}
      >
        <CheckCircle2 className="h-7 w-7" />
      </motion.div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Password updated</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">You can now sign in with your new password.</p>
      </div>
      <motion.button
        onClick={onSignIn}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-teal-500/25"
        style={{ willChange: 'transform' }}
      >
        Sign in
      </motion.button>
    </motion.div>
  )
}
