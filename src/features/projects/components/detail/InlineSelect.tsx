export interface InlineSelectOption<T extends string> {
  readonly value: T
  readonly label: string
}

export interface InlineSelectProps<T extends string> {
  readonly value:     T
  readonly options:   ReadonlyArray<InlineSelectOption<T>>
  readonly ariaLabel: string
  readonly disabled?: boolean
  readonly className?: string
  readonly onChange:  (next: T) => void | Promise<void>
}

/**
 * Bare-bones styled `<select>` that fires `onChange` immediately. Kept
 * simple — for richer overlay UX (search, descriptions) we can switch to
 * Headless UI Listbox without changing the API.
 */
export function InlineSelect<T extends string>({
  value,
  options,
  ariaLabel,
  disabled = false,
  className = '',
  onChange,
}: InlineSelectProps<T>) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => void onChange(e.target.value as T)}
      className={`rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200 inset-ring inset-ring-white/10 focus:inset-ring-teal-400/40 focus:outline-none ${className}`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-100">
          {opt.label}
        </option>
      ))}
    </select>
  )
}
