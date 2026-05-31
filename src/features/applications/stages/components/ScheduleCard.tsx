import { CalendarClock } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface ScheduleCardProps {
  readonly scheduleAt: string
  readonly formatNote: string
  readonly onChange: (patch: { scheduleAt?: string; formatNote?: string }) => void
  /** Placeholder hint for the format field (varies per stage). */
  readonly formatPlaceholder?: string
}

/**
 * Editable schedule + format block, shared by every stage workspace. Values
 * auto-save to the Stage Draft (localStorage). See ScheduleCard usage in the
 * Technical / Phone Screen / System Design specs.
 */
export function ScheduleCard({ scheduleAt, formatNote, onChange, formatPlaceholder }: ScheduleCardProps) {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="schedule-at" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <CalendarClock className="size-3.5" aria-hidden />
          Date &amp; time
        </label>
        <input
          id="schedule-at"
          type="datetime-local"
          value={scheduleAt}
          onChange={e => onChange({ scheduleAt: e.target.value })}
          className="block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
        />
      </div>
      <div className="flex-1">
        <label htmlFor="schedule-format" className="mb-1.5 block text-xs font-medium text-zinc-500">
          Format
        </label>
        <input
          id="schedule-format"
          type="text"
          value={formatNote}
          onChange={e => onChange({ formatNote: e.target.value })}
          placeholder={formatPlaceholder ?? 'e.g. 30m coding + 30m discussion'}
          className="block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
        />
      </div>
    </Card>
  )
}
