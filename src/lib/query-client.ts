import { QueryClient } from '@tanstack/react-query'

/**
 * Shared QueryClient used by both the router (for loader `ensureQueryData`
 * calls via `context.queryClient`) and the React tree (`QueryClientProvider`
 * in `__root.tsx`). Same instance on both sides keeps loader-prefetched data
 * hydrated into the client-side cache without a duplicate fetch.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
    },
  },
})
