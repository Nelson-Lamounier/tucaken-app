import { createFileRoute, Outlet, redirect, useMatches } from '@tanstack/react-router'
import AppLayout from '../components/layouts/AppLayout'
import { getMeFn } from '../server/me'

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/auth',
        search: {
          callbackUrl: location.href,
        },
      })
    }
  },
  // Triggers userProvisionMiddleware on first sign-in and hydrates plan state.
  loader: async () => {
    const me = await getMeFn()
    return { me }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  const matches = useMatches()
  const disableMainWrapper = matches.some((match) => (match.staticData as { disableMainWrapper?: boolean })?.disableMainWrapper)

  return (
    <AppLayout disableMainWrapper={disableMainWrapper}>
      <Outlet />
    </AppLayout>
  )
}

