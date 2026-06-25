import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getInvoicesFn } from '@/server/billing'

export function useInvoices() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.billing.invoices(),
    queryFn: getInvoicesFn,
  })
  return { invoices: data ?? [], isLoading }
}
