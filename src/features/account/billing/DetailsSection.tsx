// src/features/account/billing/DetailsSection.tsx
//
// Read-only billing details (email, tax IDs, address) fetched live from the
// Stripe customer. Edits route to the Stripe Customer Portal — we do not
// persist these locally.

import type { ReactNode } from 'react'
import type { Billing } from '../types'
import { Card } from '../components/primitives'
import { PortalButton } from './PortalButton'
import { useBillingDetails } from '../hooks/use-billing-details'

interface Props {
  billing: Billing
}

export function DetailsSection({ billing }: Props) {
  const { details, isLoading } = useBillingDetails()

  if (isLoading) {
    return (
      <Card>
        <div className="h-20 w-full animate-pulse rounded-md bg-white/[0.04]" />
      </Card>
    )
  }

  const notSet = <span className="text-zinc-600">Not set</span>
  const address = details?.address
  const taxId = details?.taxIds[0]?.value

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3 text-sm">
          <DetailRow label="Billing email" value={details?.email || notSet} />
          <DetailRow label="Tax ID" value={taxId || notSet} />
          <DetailRow
            label="Address"
            value={address ? <AddressBlock address={address} /> : notSet}
          />
        </div>
        <PortalButton customerId={billing.stripeCustomerId} returnPath="/billing">
          Edit details
        </PortalButton>
      </div>
    </Card>
  )
}

function AddressBlock({
  address,
}: {
  address: NonNullable<import('../types').BillingDetailsView['address']>
}) {
  return (
    <div className="text-zinc-300">
      {address.line1}
      <br />
      {address.line2 && (
        <>
          {address.line2}
          <br />
        </>
      )}
      {address.city}, {address.state} {address.postal}
      <br />
      {address.country}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 text-xs">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="text-zinc-300">{value}</div>
    </div>
  )
}
