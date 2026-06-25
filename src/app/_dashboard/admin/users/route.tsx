import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminUsersList } from '@/features/admin-users/components/AdminUsersList'
import { DashboardPage } from '@/components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/admin/users')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) {
      throw redirect({ to: '/overview' })
    }
  },
  component: AdminUsersRoute,
})

function AdminUsersRoute() {
  return (
    <DashboardPage title="Users" description="All Tucaken users across Free, Pro, and Premium tiers">
      <AdminUsersList />
    </DashboardPage>
  )
}
