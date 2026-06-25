import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getBillingDetailsFn } from '@/server/billing'

export function useBillingDetails() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.billing.details(),
    queryFn: getBillingDetailsFn,
  })
  return { details: data ?? null, isLoading }
}
