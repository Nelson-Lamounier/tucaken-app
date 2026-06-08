import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getKbHealthFn } from '@/server/kb'

/**
 * Fetch the user's KB composition for the data-health panel. Short staleTime as
 * a safety net; the IngestionSyncWatcher invalidates this key the moment a repo
 * resync completes, so the panel reflects fresh data without waiting.
 */
export function useKbHealth() {
  return useQuery({
    queryKey: adminKeys.kb.health(),
    queryFn: () => getKbHealthFn(),
    staleTime: 10_000,
  })
}
