import { Link } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'

type CalendarView = 'day' | 'week' | 'month' | 'year'

const VIEWS: readonly { value: CalendarView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

/** Shared calendar header: period title, prev/today/next nav, and view switcher. */
export function CalendarHeader({
  title,
  view,
  onPrev,
  onToday,
  onNext,
}: {
  readonly title: string
  readonly view: CalendarView
  readonly onPrev: () => void
  readonly onToday: () => void
  readonly onNext: () => void
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-2 py-4 dark:border-white/10">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-md shadow-sm ring-1 ring-zinc-200 dark:ring-white/10">
          <button
            type="button"
            onClick={onPrev}
            className="flex h-9 w-9 items-center justify-center rounded-l-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Previous"
          >
            <ChevronLeftIcon className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="border-x border-zinc-200 px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            Today
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex h-9 w-9 items-center justify-center rounded-r-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Next"
          >
            <ChevronRightIcon className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex items-center rounded-md p-0.5 ring-1 ring-zinc-200 dark:ring-white/10">
          {VIEWS.map(v => (
            <Link
              key={v.value}
              to="/calendar"
              search={{ view: v.value }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                v.value === view
                  ? 'bg-accent text-white'
                  : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  )
}

export type { CalendarView }
