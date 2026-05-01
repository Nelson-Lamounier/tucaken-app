"use client"
// src/features/auth/components/OtpForm.tsx
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

interface OtpFormProps {
  onBack: () => void
  onSubmit?: (code: string) => Promise<void>
  length?: number
}

export function OtpForm({ onBack, onSubmit, length = 6 }: OtpFormProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(''))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  const code = digits.join('')
  const complete = code.length === length

  const setAt = (i: number, ch: string) => {
    setError(null)
    setDigits((prev) => {
      const next = [...prev]
      next[i] = ch
      return next
    })
  }

  const handleChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '')
    if (!v) {
      setAt(i, '')
      return
    }
    if (v.length === 1) {
      setAt(i, v)
      refs.current[i + 1]?.focus()
    } else {
      // paste
      const chars = v.slice(0, length - i).split('')
      setDigits((prev) => {
        const next = [...prev]
        chars.forEach((c, idx) => (next[i + idx] = c))
        return next
      })
      refs.current[Math.min(i + chars.length, length - 1)]?.focus()
    }
  }

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
  }

  const submit = async () => {
    if (!complete) return
    setSubmitting(true)
    try {
      await onSubmit?.(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
      setDigits(Array(length).fill(''))
      refs.current[0]?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (complete) submit()
  }, [code])

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

      <header className="space-y-2">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Two-factor verification
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enter the 6-digit code from your authenticator app.
        </p>
      </header>

      <motion.div
        animate={error ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="flex justify-between gap-2"
        style={{ willChange: 'transform' }}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={length}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            className={[
              'h-14 w-full rounded-xl border bg-white/60 text-center text-xl font-semibold text-zinc-900',
              'backdrop-blur-md transition-all focus:outline-none',
              'dark:bg-zinc-900/40 dark:text-zinc-100',
              error
                ? 'border-red-400/60 ring-2 ring-red-400/20'
                : d
                  ? 'border-teal-500/60 ring-2 ring-teal-500/20'
                  : 'border-zinc-200/80 dark:border-white/10',
            ].join(' ')}
          />
        ))}
      </motion.div>

      {error && <p className="text-center text-xs text-red-500">{error}</p>}
      {submitting && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Verifying…</p>
      )}

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Didn&apos;t get a code?{' '}
        <button className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400">Resend</button>
      </p>
    </motion.div>
  )
}
