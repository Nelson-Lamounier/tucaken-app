import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'

export interface InlineTextProps {
  readonly value:        string | null
  readonly placeholder?: string
  readonly multiline?:   boolean
  readonly maxLength?:   number
  readonly className?:   string
  readonly displayAs?:   'inherit' | 'heading' | 'body'
  readonly ariaLabel:    string
  readonly disabled?:    boolean
  readonly onSave:       (next: string | null) => void | Promise<void>
}

/**
 * Click-to-edit text field. Single-line by default; pass `multiline` for a
 * resizing textarea. Empty string saves as `null` so callers can clear values.
 * Enter commits (Cmd/Ctrl+Enter in multiline); Esc cancels.
 */
export function InlineText({
  value,
  placeholder = 'Click to add…',
  multiline = false,
  maxLength,
  className = '',
  displayAs = 'inherit',
  ariaLabel,
  disabled = false,
  onSave,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  const startEditing = () => {
    if (disabled) return
    setDraft(value ?? '')
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '').trim()) {
      setEditing(false)
      return
    }
    void Promise.resolve(onSave(trimmed.length === 0 ? null : trimmed)).finally(() => {
      setEditing(false)
    })
  }

  const cancel = () => {
    setDraft(value ?? '')
    setEditing(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit()
    }
  }

  if (editing) {
    const sharedProps = {
      value:    draft,
      maxLength,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onKeyDown,
      onBlur:   commit,
      'aria-label': ariaLabel,
      className: `w-full rounded-md bg-white/5 px-2 py-1 text-zinc-100 inset-ring inset-ring-teal-400/40 focus:outline-none ${
        displayAs === 'heading' ? 'text-xl font-semibold' : 'text-sm'
      } ${className}`,
    }
    return (
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            ref={(el) => { inputRef.current = el }}
            rows={4}
            {...sharedProps}
          />
        ) : (
          <input
            ref={(el) => { inputRef.current = el }}
            type="text"
            {...sharedProps}
          />
        )}
        <div className="flex shrink-0 items-center gap-1">
          <IconButton onClick={commit}  label="Save (Enter)"   icon={Check} />
          <IconButton onClick={cancel}  label="Cancel (Esc)"   icon={X}     />
        </div>
      </div>
    )
  }

  const display = value && value.trim().length > 0 ? value : placeholder
  const isPlaceholder = !(value && value.trim().length > 0)

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      aria-label={`Edit ${ariaLabel}`}
      className={`group/inline -mx-2 -my-1 flex w-full items-start gap-2 rounded-md px-2 py-1 text-left transition-colors ${
        disabled
          ? 'cursor-default'
          : 'hover:bg-white/5'
      } ${className}`}
    >
      <span
        className={`min-w-0 flex-1 ${
          displayAs === 'heading'
            ? 'text-xl font-semibold text-zinc-100'
            : 'text-sm text-zinc-300'
        } ${isPlaceholder ? 'italic text-zinc-600' : ''} ${
          multiline ? 'whitespace-pre-wrap' : 'truncate'
        }`}
      >
        {display}
      </span>
      {!disabled && (
        <Pencil
          aria-hidden
          className="mt-1 size-3 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover/inline:opacity-100"
        />
      )}
    </button>
  )
}

function IconButton({
  onClick,
  label,
  icon: Icon,
}: {
  readonly onClick: () => void
  readonly label:   string
  readonly icon:    React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md bg-white/5 text-zinc-300 inset-ring inset-ring-white/10 hover:bg-white/10 hover:text-white"
    >
      <Icon className="size-3.5" />
    </button>
  )
}
