import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getPaymentMethodFn } from '@/server/billing'

export function usePaymentMethod() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.billing.paymentMethod(),
    queryFn: getPaymentMethodFn,
  })
  return { paymentMethod: data ?? null, isLoading }
}
