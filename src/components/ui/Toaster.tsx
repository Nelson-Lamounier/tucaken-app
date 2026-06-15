'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useToastStore, type Toast, type ToastType } from '@/lib/stores/toast-store'

/** Per-severity presentation — icon + accent colours. Map (not nested ternaries). */
const TONE: Record<ToastType, { Icon: LucideIcon; icon: string; bar: string; ring: string }> = {
  error:   { Icon: AlertCircle,   icon: 'text-red-600 dark:text-red-400',       bar: 'bg-red-500',     ring: 'ring-red-600/15 dark:ring-red-500/25' },
  warning: { Icon: AlertTriangle, icon: 'text-amber-600 dark:text-amber-400',   bar: 'bg-amber-500',   ring: 'ring-amber-600/15 dark:ring-amber-500/25' },
  success: { Icon: CheckCircle2,  icon: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', ring: 'ring-emerald-600/15 dark:ring-emerald-500/25' },
  info:    { Icon: Info,          icon: 'text-teal-600 dark:text-teal-400',      bar: 'bg-teal-500',    ring: 'ring-teal-600/15 dark:ring-teal-500/25' },
}

function ToastCard({ toast, onDismiss, reduce }: { toast: Toast; onDismiss: () => void; reduce: boolean }) {
  const tone = TONE[toast.type]
  const { Icon } = tone
  // Errors/warnings are assertive; success/info are polite.
  const role = toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'

  return (
    <motion.div
      layout
      role={role}
      initial={{ opacity: 0, x: reduce ? 0 : 24, scale: reduce ? 1 : 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: reduce ? 0 : 24, scale: reduce ? 1 : 0.98 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      style={{ willChange: 'transform, opacity' }}
      className={`relative flex gap-3 overflow-hidden rounded-md bg-white p-4 pr-9 shadow-lg ring-1 ${tone.ring} dark:bg-zinc-900`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${tone.icon}`} />

      <div className="min-w-0 flex-1">
        {toast.title && (
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{toast.title}</p>
        )}
        <p className={`text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 ${toast.title ? 'mt-0.5' : ''}`}>
          {toast.message}
        </p>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
            className="mt-2 rounded-md px-2 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-600/20 transition-colors hover:bg-teal-50 dark:text-teal-300 dark:ring-teal-400/25 dark:hover:bg-teal-500/10"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/5 dark:hover:text-zinc-200"
      >
        <X className="size-4" />
      </button>
    </motion.div>
  )
}

/**
 * App-global toast stack — standardized errors and notifications. Top-right,
 * stacked, dismissible. Driven by `useToastStore`; push errors via `notifyError`
 * so wording stays consistent and server detail never reaches the screen.
 * Mounted once in __root.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)
  const reduce = useReducedMotion()

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-100 flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastCard toast={t} onDismiss={() => removeToast(t.id)} reduce={Boolean(reduce)} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
