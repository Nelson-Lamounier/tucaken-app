import { createFileRoute } from '@tanstack/react-router'
import { BillingPage } from '@/features/account/billing/BillingPage'
import { useBilling } from '@/features/account/hooks/use-billing'

export const Route = createFileRoute('/_dashboard/billing')({
  component: BillingRoute,
})

function BillingRoute() {
  const { billing, update } = useBilling()
  return <BillingPage billing={billing} onUpdateBilling={update} />
}
