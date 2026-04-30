"use client"
// src/features/auth/components/VerifyEmailScreen.tsx
import { motion } from 'motion/react'
import { Mail, ArrowLeft } from 'lucide-react'

interface VerifyEmailScreenProps {
  email: string
  onBack: () => void
  onResend?: () => void | Promise<void>
}

export function VerifyEmailScreen({ email, onBack, onResend }: VerifyEmailScreenProps) {
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
          We sent a verification link to
          <br />
          <span className="font-medium text-zinc-700 dark:text-zinc-200">{email}</span>
        </p>
      </div>

      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={onResend}
        className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-200/80 bg-white/70 text-sm font-medium text-zinc-700 backdrop-blur-md transition-colors hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
        style={{ willChange: 'transform' }}
      >
        Resend verification email
      </motion.button>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Wrong address?{' '}
        <button onClick={onBack} className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400">
          Use a different email
        </button>
      </p>
    </motion.div>
  )
}
