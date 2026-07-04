import { createFileRoute, Outlet, redirect, useMatches } from '@tanstack/react-router'
import AppLayout from '../components/layouts/AppLayout'
import { getMeFn } from '../server/me'
import type { MeResponse } from '../server/me'

/**
 * Substrings that mark an EXPECTED unauthenticated state (no/expired session)
 * rather than a backend failure. These redirect to sign-in silently — they are
 * not errors and must not be logged (they were inflating the RUM error count).
 */
const AUTH_ERROR_MARKERS = ['401', 'No session', 'Session expired'] as const

/** Retry budget for transient getMeFn failures (network / admin-api NotReady / 5xx). */
const ME_MAX_RETRIES = 2
/** Backoff between retries, indexed by attempt number (ms). */
const ME_RETRY_BACKOFF_MS = [200, 500] as const

/** True when the error message indicates an expected unauthenticated state. */
function isAuthError(msg: string): boolean {
  return AUTH_ERROR_MARKERS.some((marker) => msg.includes(marker))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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
    // getMeFn() calls /api/admin/me which runs userProvisionMiddleware — the
    // upsert happens here on first sign-in (idempotent, so retrying is safe).
    //
    // Two failure classes are handled differently:
    //   - Unauthenticated (no/expired session): an EXPECTED state, not an error.
    //     Redirect to sign-in WITHOUT logging, so it never reaches Faro as a
    //     browser exception (this was ~half the app's RUM error volume).
    //   - Transient backend blip (admin-api briefly NotReady during a rollout /
    //     DB reconnect, a network failure, or a 5xx): retry with backoff before
    //     giving up, so a momentary outage doesn't become a hard error boundary.
    let me: MeResponse | undefined
    let lastError: unknown
    for (let attempt = 0; attempt <= ME_MAX_RETRIES; attempt++) {
      try {
        me = await getMeFn()
        break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isAuthError(msg)) {
          // Expected — quiet redirect, no console.error.
          throw redirect({ to: '/sign-in', search: { callbackUrl: location.href } })
        }
        lastError = e
        if (attempt < ME_MAX_RETRIES) {
          await sleep(ME_RETRY_BACKOFF_MS[attempt] ?? 500)
        }
      }
    }

    if (!me) {
      // Only a genuine failure — one that survived every retry — is logged.
      const msg = lastError instanceof Error ? lastError.message : String(lastError)
      console.error(`[dashboard] getMeFn failed after ${ME_MAX_RETRIES + 1} attempts:`, msg)
      throw lastError
    }

    return { me, isAdmin: me.plan.role === 'admin' }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  const { me, isAdmin } = Route.useRouteContext()
  const matches = useMatches()
  const disableMainWrapper = matches.some((match) => (match.staticData as { disableMainWrapper?: boolean })?.disableMainWrapper)

  return (
    <AppLayout me={me} isAdmin={isAdmin} disableMainWrapper={disableMainWrapper}>
      <Outlet />
    </AppLayout>
  )
}

