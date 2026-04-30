"use client"
// src/features/auth/components/PasswordField.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Eye, EyeOff, Check, X, Lock } from 'lucide-react'
import { AuthInput } from './AuthInput'
import { passwordRules, passwordStrength } from '../validation'

interface PasswordFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: any
  label?: string
  showStrength?: boolean
  showChecklist?: boolean
}

const strengthColors = [
  'bg-zinc-300 dark:bg-zinc-700',
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-teal-500',
  'bg-emerald-500',
] as const

export function PasswordField({
  field,
  label = 'Password',
  showStrength = true,
  showChecklist = true,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false)
  const value = (field.state.value as string) ?? ''
  const { score, label: strengthLabel } = passwordStrength(value)

  return (
    <div className="space-y-2">
      <div className="relative">
        <AuthInput
          label={label}
          field={field}
          type={show ? 'text' : 'password'}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="current-password"
          showValid={false}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-9 top-[22px] text-zinc-400 transition-colors hover:text-teal-500"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {showStrength && (
        <AnimatePresence>
          {value.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1.5 px-1"
            >
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= score ? strengthColors[score] : 'bg-zinc-200 dark:bg-zinc-800'}`}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: i * 0.05 }}
                    style={{ originX: 0, willChange: 'transform' }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-500 dark:text-zinc-400">Strength</span>
                <motion.span
                  key={strengthLabel}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={[
                    'font-medium',
                    score <= 1 && 'text-red-500',
                    score === 2 && 'text-orange-500',
                    score === 3 && 'text-amber-500',
                    score === 4 && 'text-teal-500',
                    score === 5 && 'text-emerald-500',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ willChange: 'transform, opacity' }}
                >
                  {strengthLabel}
                </motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {showChecklist && (
        <AnimatePresence>
          {value.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 gap-x-3 gap-y-1 px-1 pt-1 text-[11px]"
            >
              {passwordRules.map((rule) => {
                const ok = rule.test(value)
                return (
                  <motion.li
                    key={rule.id}
                    layout
                    className={`flex items-center gap-1.5 ${ok ? 'text-emerald-500' : 'text-zinc-400 dark:text-zinc-500'}`}
                  >
                    <motion.span
                      animate={ok ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${ok ? 'bg-emerald-500/20' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                      style={{ willChange: 'transform' }}
                    >
                      {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5 opacity-50" />}
                    </motion.span>
                    {rule.label}
                  </motion.li>
                )
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
