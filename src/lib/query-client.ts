import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { useToastStore } from './stores/toast-store'

/**
 * Errors that indicate the session could not be recovered even after the
 * server-side silent refresh (see src/server/session-refresh.ts). Matches
 * the AuthenticationError messages thrown by requireAuth/requireAdmin and
 * raw admin-api 401 surfaces.
 */
const AUTH_FAILURE_MARKERS = ['No session', 'Session expired', 'UNAUTHENTICATED', '[401]'] as const

function isAuthFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return AUTH_FAILURE_MARKERS.some((marker) => msg.includes(marker))
}

/** One redirect per expiry event, not one per in-flight query that fails. */
let redirectingToSignIn = false

/**
 * Central handler for authentication failures surfacing through React Query.
 * By the time an error carries an auth marker the silent refresh has already
 * been attempted and failed (revoked/expired refresh token), so the only
 * correct UX is a single, consistent hand-off to sign-in that preserves the
 * user's location.
 */
function handleAuthFailure(error: unknown): void {
  if (!isAuthFailure(error)) return
  if (typeof window === 'undefined') return
  if (redirectingToSignIn) return
  if (window.location.pathname.startsWith('/sign-in')) return

  redirectingToSignIn = true
  useToastStore.getState().addToast('error', 'Your session has expired — please sign in again.')
  const callbackUrl = window.location.pathname + window.location.search
  const target = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}&reason=expired`
  // Full navigation (not router.navigate): clears all in-memory state that
  // assumed an authenticated session.
  window.setTimeout(() => { window.location.assign(target) }, 400)
}

/**
 * Shared QueryClient used by both the router (for loader `ensureQueryData`
 * calls via `context.queryClient`) and the React tree (`QueryClientProvider`
 * in `__root.tsx`). Same instance on both sides keeps loader-prefetched data
 * hydrated into the client-side cache without a duplicate fetch.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleAuthFailure,
  }),
  mutationCache: new MutationCache({
    onError: handleAuthFailure,
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
    },
  },
})
