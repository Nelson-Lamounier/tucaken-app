import { useQuery } from '@tanstack/react-query'
import { getKbHealthFn } from '@/server/kb'

/** Fetch the user's KB composition for the data-health panel. */
export function useKbHealth() {
  return useQuery({
    queryKey: ['admin', 'kb', 'health'],
    queryFn: () => getKbHealthFn(),
    staleTime: 60_000,
  })
}
