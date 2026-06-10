import { Search } from 'lucide-react'
import { CustomDropDown } from '@/components/ui/CustomDropDown'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectStatus,
  type ProjectType,
} from '../../lib/types'

export interface ProjectFilterValue {
  readonly type:   ProjectType   | 'all'
  readonly status: ProjectStatus | 'all'
}

export interface ProjectFilterBarProps {
  readonly value: ProjectFilterValue
  readonly onChange: (next: ProjectFilterValue) => void
  /** Opens the command palette (search) — mirrors the applications list. */
  readonly onSearchClick: () => void
}

const TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'All types' },
  ...(Object.entries(PROJECT_TYPE_LABELS) as Array<[ProjectType, string]>).map(([value, label]) => ({
    value,
    label,
  })),
]

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'Any status' },
  ...(Object.entries(PROJECT_STATUS_LABELS) as Array<[ProjectStatus, string]>)
    .filter(([value]) => value !== 'archived')
    .map(([value, label]) => ({ value, label })),
]

/**
 * Standardised filter + search row — matches the Job Applications list:
 * dropdown filters on the left, a ⌘K search trigger filling the rest.
 */
export function ProjectFilterBar({ value, onChange, onSearchClick }: ProjectFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-white/2 p-3 inset-ring inset-ring-white/10 sm:flex-row sm:items-center">
      <div className="z-10 w-full sm:w-48">
        <CustomDropDown
          options={TYPE_OPTIONS}
          value={value.type}
          onChange={(next) => onChange({ ...value, type: next as ProjectType | 'all' })}
        />
      </div>
      <div className="z-10 w-full sm:w-48">
        <CustomDropDown
          options={STATUS_OPTIONS}
          value={value.status}
          onChange={(next) => onChange({ ...value, status: next as ProjectStatus | 'all' })}
        />
      </div>

      <div className="group relative flex-1">
        <button
          type="button"
          onClick={onSearchClick}
          className="flex w-full items-center justify-between rounded-md bg-zinc-100 py-1.5 pl-3 pr-2 text-sm text-zinc-500 outline-1 -outline-offset-1 outline-zinc-300 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500 dark:bg-white/5 dark:text-zinc-400 dark:outline-white/10 dark:hover:bg-white/10"
        >
          <div className="flex items-center">
            <Search className="mr-2 h-4 w-4 text-zinc-500 group-hover:text-zinc-400" />
            <span>Search projects...</span>
          </div>
          <kbd className="hidden items-center rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-sans text-xs text-zinc-500 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
            <abbr title="Command" className="no-underline">⌘</abbr>K
          </kbd>
        </button>
      </div>
    </div>
  )
}
