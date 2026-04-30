"use client"
// src/features/auth/components/AuthInput.tsx
import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, AlertCircle } from 'lucide-react'

interface AuthInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: any
  icon?: ReactNode
  showValid?: boolean
}

export function AuthInput({ label, field, icon, showValid = true, type = 'text', ...rest }: AuthInputProps) {
  const [focused, setFocused] = useState(false)
  const value = field.state.value as string
  const rawErrors = field.state.meta.errors as (string | { message?: string } | unknown)[]
  const errors = rawErrors.map((e) =>
    typeof e === 'string' ? e : (e as { message?: string })?.message ?? String(e),
  )
  const isTouched = field.state.meta.isTouched as boolean
  const hasError = isTouched && errors.length > 0
  const isValid = isTouched && !hasError && value.length > 0

  return (
    <div>
      <motion.div
        animate={hasError ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className={[
          'relative rounded-xl border backdrop-blur-md transition-colors',
          'bg-white/60 dark:bg-zinc-900/40',
          hasError
            ? 'border-red-400/60 ring-2 ring-red-400/20'
            : focused
              ? 'border-teal-500/60 ring-2 ring-teal-500/20'
              : 'border-zinc-200/80 dark:border-white/10',
        ].join(' ')}
        style={{ willChange: 'transform' }}
      >
        <label
          htmlFor={field.name}
          className={[
            'pointer-events-none absolute left-3 transition-all',
            focused || value
              ? 'top-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400'
              : 'top-1/2 -translate-y-1/2 text-sm text-zinc-500 dark:text-zinc-400',
            icon && !(focused || value) ? 'left-10' : '',
          ].join(' ')}
        >
          {label}
        </label>
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
            {icon}
          </span>
        )}
        <input
          id={field.name}
          name={field.name}
          type={type}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            field.handleBlur()
          }}
          onChange={(e) => field.handleChange(e.target.value)}
          className={[
            'w-full bg-transparent pb-2 pt-6 text-sm text-zinc-900 dark:text-zinc-100',
            'placeholder:text-zinc-400 focus:outline-none',
            icon ? 'pl-10 pr-10' : 'pl-3 pr-10',
          ].join(' ')}
          {...rest}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          <AnimatePresence mode="wait">
            {hasError && (
              <motion.span
                key="err"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="text-red-500"
                style={{ willChange: 'transform' }}
              >
                <AlertCircle className="h-4 w-4" />
              </motion.span>
            )}
            {showValid && isValid && (
              <motion.span
                key="ok"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="text-emerald-500"
                style={{ willChange: 'transform' }}
              >
                <Check className="h-4 w-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </motion.div>
      <AnimatePresence>
        {hasError && (
          <motion.p
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            className="mt-1 px-1 text-xs text-red-500"
          >
            {errors[0]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
