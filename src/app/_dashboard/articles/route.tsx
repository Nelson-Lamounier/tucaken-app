import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_dashboard/articles')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: () => <Outlet />,
})
