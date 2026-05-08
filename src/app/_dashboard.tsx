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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[dashboard] getMeFn failed:', msg)
      // Only redirect to sign-in on auth errors — other failures (network, 5xx)
      // should surface as errors rather than silently dropping the session.
      if (msg.includes('401') || msg.includes('No session') || msg.includes('Session expired')) {
        throw redirect({ to: '/sign-in', search: { callbackUrl: location.href } })
      }
      throw e
    }

    return { me }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  const { me } = Route.useRouteContext()
  const matches = useMatches()
  const disableMainWrapper = matches.some((match) => (match.staticData as { disableMainWrapper?: boolean })?.disableMainWrapper)

  return (
    <AppLayout me={me} disableMainWrapper={disableMainWrapper}>
      <Outlet />
    </AppLayout>
  )
}

