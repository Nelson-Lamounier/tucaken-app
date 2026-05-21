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
}

const TYPE_OPTIONS: ReadonlyArray<{ value: ProjectType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  ...(Object.entries(PROJECT_TYPE_LABELS) as Array<[ProjectType, string]>).map(([value, label]) => ({
    value,
    label,
  })),
]

const STATUS_OPTIONS: ReadonlyArray<{ value: ProjectStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Any' },
  ...(Object.entries(PROJECT_STATUS_LABELS) as Array<[ProjectStatus, string]>)
    .filter(([value]) => value !== 'archived')
    .map(([value, label]) => ({ value, label })),
]

export function ProjectFilterBar({ value, onChange }: ProjectFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ChipGroup
        label="Type"
        options={TYPE_OPTIONS}
        selected={value.type}
        onSelect={(next) => onChange({ ...value, type: next })}
      />
      <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
      <ChipGroup
        label="Status"
        options={STATUS_OPTIONS}
        selected={value.status}
        onSelect={(next) => onChange({ ...value, status: next })}
      />
    </div>
  )
}

interface ChipGroupProps<T extends string> {
  readonly label:    string
  readonly options:  ReadonlyArray<{ value: T; label: string }>
  readonly selected: T
  readonly onSelect: (next: T) => void
}

function ChipGroup<T extends string>({ label, options, selected, onSelect }: ChipGroupProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt.value === selected
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              aria-pressed={active}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                active
                  ? 'bg-teal-400/15 text-teal-200 inset-ring inset-ring-teal-400/40'
                  : 'bg-white/5 text-zinc-400 inset-ring inset-ring-white/10 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
