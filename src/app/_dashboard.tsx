import { createFileRoute, Outlet, redirect, useMatches } from '@tanstack/react-router'
import AppLayout from '../components/layouts/AppLayout'
import { getMeFn } from '../server/me'
import type { MeResponse } from '../server/me'

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: async ({ context, location }) => {
    // Gate 1: valid Cognito session
    if (!context.auth.user) {
      throw redirect({
        to: '/sign-in',
        search: { callbackUrl: location.href },
      })
    }

    // Gate 2: user must exist in the database.
    // getMeFn() calls /api/admin/me which runs userProvisionMiddleware —
    // the upsert happens here on first sign-in. If provisioning fails
    // (DB unreachable, 503) we redirect back to /sign-in rather than letting
    // the user into an unusable dashboard.
    let me: MeResponse
    try {
      me = await getMeFn()
    } catch {
      throw redirect({
        to: '/sign-in',
        search: { callbackUrl: location.href },
      })
    }

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

