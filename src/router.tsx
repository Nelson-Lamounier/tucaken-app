import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { queryClient } from './lib/query-client'
import type { AuthState } from './server/session'

export interface RouterContext {
  auth:        AuthState
  queryClient: QueryClient
}

// No basepath — the app serves at /. Routes live at /overview, /sign-in, etc.
export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: {
      auth: { user: null },
      queryClient,
    } as RouterContext,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
