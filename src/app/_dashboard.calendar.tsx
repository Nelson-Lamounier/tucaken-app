import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { DashboardPage } from '../components/layouts/DashboardPage'
import MonthView from '../features/calendars/components/MonthView'
import WeekView from '../features/calendars/components/WeekView'
import DayView from '../features/calendars/components/DayView'
import YearView from '../features/calendars/components/YearView'
import { scheduledInterviewsQueryOptions, useScheduledInterviews } from '../features/calendars/api/scheduled-interviews'

const calendarSearchSchema = z.object({
  view: z.enum(['day', 'week', 'month', 'year']).catch('month'),
})

export const Route = createFileRoute('/_dashboard/calendar')({
  validateSearch: calendarSearchSchema,
  loader: async ({ context }) => {
    // Best-effort hydration — never block the calendar on a backend error
    // (e.g. before the admin-api is redeployed with the endpoint).
    await context.queryClient.ensureQueryData(scheduledInterviewsQueryOptions()).catch(() => undefined)
  },
  component: CalendarPage,
})

function CalendarPage() {
  const { view } = Route.useSearch()
  // Shares the same query key as the views (deduped) — surfaces a load error
  // instead of a silently-empty calendar.
  const { isError } = useScheduledInterviews()

  return (
    <DashboardPage
      title="Calendar"
      description="View and manage events across different periods."
    >
      {isError && (
        <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
          Couldn&apos;t load your scheduled interviews. The calendar will populate once the API is reachable.
        </div>
      )}
      {view === 'month' && <MonthView />}
      {view === 'week' && <WeekView />}
      {view === 'day' && <DayView />}
      {view === 'year' && <YearView />}
    </DashboardPage>
  )
}
