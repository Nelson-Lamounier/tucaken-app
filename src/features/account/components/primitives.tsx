// src/features/account/components/primitives.tsx
//
// Tiny shared UI primitives used across Billing and Settings pages.
// These mirror the existing patterns in onboarding/auth: zinc/teal palette,
// rounded-xl cards, lowercase tracking-wide eyebrow labels.

import type { ReactNode } from 'react'

// ---- Card ------------------------------------------------------------------
export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={[
        'rounded-xl border border-white/10 bg-white/[0.02] p-5',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

// ---- Section header (used inside PageSection bodies) -----------------------
export function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
        {sub && (
          <p className="mt-1 max-w-[60ch] text-pretty text-xs leading-relaxed text-zinc-400">
            {sub}
          </p>
        )}
      </div>
      {action}
    </header>
  )
}

// ---- Form field with optional hint / error --------------------------------
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {label}
        </span>
        {hint && !error && (
          <span className="text-[10px] text-zinc-600">{hint}</span>
        )}
        {error && (
          <span className="text-[10px] font-medium text-rose-300">{error}</span>
        )}
      </div>
      {children}
    </label>
  )
}

// ---- Default text-input class ---------------------------------------------
export function inputCls(error?: string) {
  return [
    'w-full rounded-md border bg-zinc-950/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition',
    error
      ? 'border-rose-400/40 focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20'
      : 'border-white/10 focus:border-teal-400/40 focus:ring-2 focus:ring-teal-400/20',
  ].join(' ')
}

// ---- Toggle switch ---------------------------------------------------------
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
        checked
          ? 'bg-teal-500'
          : 'bg-white/[0.06] ring-1 ring-inset ring-white/10',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block size-3.5 transform rounded-full bg-white shadow transition',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        ].join(' ')}
      />
    </button>
  )
}

// ---- Icon-led row (icon · title/sub · action) ------------------------------
export function Row({
  icon,
  title,
  sub,
  action,
  badge,
  titleColor = 'text-zinc-100',
}: {
  icon?: ReactNode
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
  badge?: ReactNode
  titleColor?: string
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {icon && (
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/5">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={['text-sm font-medium', titleColor].join(' ')}>
            {title}
          </span>
          {badge}
        </div>
        {sub && (
          <p className="mt-0.5 max-w-[60ch] text-[11px] leading-relaxed text-zinc-500">
            {sub}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---- Segmented control (lightweight wrapper) -------------------------------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div
      className={[
        'inline-flex rounded-md border border-white/10 bg-zinc-950/40 p-0.5 text-xs',
        className,
      ].join(' ')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            'whitespace-nowrap rounded px-3 py-1 transition',
            value === o.value
              ? 'bg-white/[0.06] text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---- Date helpers ----------------------------------------------------------
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never'
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return fmtDate(iso)
}

export function fmtMoney(n: number, cur = '$') {
  return cur + n.toFixed(2)
}
