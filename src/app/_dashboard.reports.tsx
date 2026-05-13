import { createFileRoute, redirect } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import ReportContainer from '@/features/reports/components/ReportContainer'

export const Route = createFileRoute('/_dashboard/reports')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: ReportsPage,
})

function ReportsPage() {
  return (
    <DashboardPage title="Reporting">
      <div>
        <h2 className="mb-4 text-xl font-bold text-zinc-100">Global AI Usage</h2>
        <ReportContainer />
      </div>
    </DashboardPage>
  )
}
