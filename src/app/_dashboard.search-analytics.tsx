import { createFileRoute, redirect } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { getFunnelAnalyticsFn } from '@/server/pipelines'
import { SearchSummary } from '@/features/search-analytics/SearchSummary'
import { FunnelView } from '@/features/search-analytics/FunnelView'

export const Route = createFileRoute('/_dashboard/search-analytics')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  loader: () => getFunnelAnalyticsFn(),
  component: SearchAnalyticsPage,
})

function SearchAnalyticsPage() {
  const analytics = Route.useLoaderData()

  return (
    <DashboardPage
      title="Search analytics"
      description="Where your 2026 search stands — honest ranges, no scores."
    >
      <div className="space-y-6">
        <SearchSummary
          summary={analytics.summary}
          medianDaysToOffer={analytics.ranges.medianDaysToOffer}
        />
        <FunnelView transitions={analytics.transitions} />
      </div>
    </DashboardPage>
  )
}
