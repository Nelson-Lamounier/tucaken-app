import { useCallback, useState } from 'react'
import type { Billing } from '../types'
import { DEFAULT_BILLING } from '../defaults'

// TODO: swap with React Query + server fns once `/me/billing` endpoint lands.
//   const { data } = useQuery({ queryKey: queryKeys.billing.detail(), queryFn: getBillingFn })
//   const mutation = useMutation({ mutationFn: updateBillingFn, ... })
// For now this hook keeps in-memory state so the page is wired and exercisable.
export function useBilling() {
  const [billing, setBilling] = useState<Billing>(DEFAULT_BILLING)

  const update = useCallback((patch: Partial<Billing>) => {
    setBilling((prev) => ({ ...prev, ...patch }))
  }, [])

  return { billing, update }
}
