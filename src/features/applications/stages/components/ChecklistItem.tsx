import type { ChecklistEntry } from '../types/workspace'

interface ChecklistItemProps {
  readonly entry: ChecklistEntry
  readonly checked: boolean
  readonly onToggle: (id: string) => void
}

/**
 * Checkbox + label row (e.g. "questions to ask the recruiter"). Checked state
 * is persisted per application+stage via useStageDraft.
 */
export function ChecklistItem({ entry, checked, onToggle }: ChecklistItemProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(entry.id)}
        className="mt-0.5 size-4 rounded border-zinc-300 bg-white text-[var(--accent)] focus:ring-teal-500/30 dark:border-zinc-600 dark:bg-zinc-800"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-zinc-800 dark:text-zinc-200">{entry.label}</span>
        {entry.rationale && (
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{entry.rationale}</span>
        )}
      </span>
    </label>
  )
}
