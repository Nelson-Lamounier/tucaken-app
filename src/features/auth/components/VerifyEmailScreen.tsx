"use client"
// src/features/auth/components/VerifyEmailScreen.tsx
import { useState } from 'react'
import { motion } from 'motion/react'
import { Mail, ArrowLeft } from 'lucide-react'

interface VerifyEmailScreenProps {
  email: string
  onBack: () => void
  onResend?: () => void | Promise<void>
  onConfirm?: (code: string) => Promise<void>
}

export function VerifyEmailScreen({ email, onBack, onResend, onConfirm }: VerifyEmailScreenProps) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (!code.trim() || !onConfirm) return
    setError(null)
    setSubmitting(true)
    try {
      await onConfirm(code.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!onResend) return
    setResending(true)
    try { await onResend() } finally { setResending(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="space-y-5"
      style={{ willChange: 'transform, opacity' }}
    >
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-teal-500 dark:text-zinc-400">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="space-y-3 py-2 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.15, 1] }}
          transition={{ duration: 0.5, times: [0, 0.6, 1] }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30"
          style={{ willChange: 'transform' }}
        >
          <Mail className="h-8 w-8" />
        </motion.div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Verify your email
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          We sent a 6-digit code to
          <br />
          <span className="font-medium text-zinc-700 dark:text-zinc-200">{email}</span>
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-xl border border-zinc-200/80 bg-white/70 px-4 py-3 text-center text-2xl font-semibold tracking-[0.5em] text-zinc-900 placeholder-zinc-300 backdrop-blur-md outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600"
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        />

        {error && (
          <p className="text-center text-xs font-medium text-red-500">{error}</p>
        )}

        <motion.button
          type="button"
          disabled={code.length < 6 || submitting}
          onClick={handleConfirm}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-shadow hover:shadow-xl hover:shadow-teal-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ willChange: 'transform' }}
        >
          {submitting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            'Verify account'
          )}
        </motion.button>

        <motion.button
          type="button"
          disabled={resending}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleResend}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-200/80 bg-white/70 text-sm font-medium text-zinc-700 backdrop-blur-md transition-colors hover:bg-white disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          style={{ willChange: 'transform' }}
        >
          {resending ? 'Sending…' : 'Resend code'}
        </motion.button>
      </div>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Wrong address?{' '}
        <button onClick={onBack} className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400">
          Use a different email
        </button>
      </p>
    </motion.div>
  )
}
