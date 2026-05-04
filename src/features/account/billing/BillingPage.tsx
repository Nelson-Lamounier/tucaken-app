// src/features/account/billing/BillingPage.tsx
//
// Composes the Billing page sections into the shared anchored PageShell.
// Renders WITHOUT a left nav — the host AppLayout supplies its own.

import {
  AlertTriangle,
  Building2,
  Clock,
  CreditCard,
  Receipt,
  Sparkles,
} from 'lucide-react'
import type { BillingPageProps, PageNavSection } from '../types'
import { PageSection, PageShell } from '../components/PageShell'
import { PlanSection } from './PlanSection'
import { PaymentSection } from './PaymentSection'
import { UsageSection } from './UsageSection'
import { InvoicesSection } from './InvoicesSection'
import { DetailsSection } from './DetailsSection'
import { CancelSection } from './CancelSection'

const SECTIONS: PageNavSection[] = [
  { id: 'plan',     label: 'Plan',             icon: Sparkles    },
  { id: 'payment',  label: 'Payment method',   icon: CreditCard  },
  { id: 'usage',    label: 'Usage this month', icon: Clock       },
  { id: 'invoices', label: 'Invoices',         icon: Receipt     },
  { id: 'details',  label: 'Billing details',  icon: Building2   },
  { id: 'cancel',   label: 'Cancel',           icon: AlertTriangle },
]

export function BillingPage({ billing, onUpdateBilling }: BillingPageProps) {
  return (
    <PageShell
      eyebrow="Account"
      title="Billing"
      sub="Manage your plan, payment method, and invoice history. Switching plans takes effect immediately and is prorated."
      sections={SECTIONS}
    >
      <PageSection
        id="plan"
        label="Plan"
        sub="You can switch or cancel anytime. We prorate down to the day."
      >
        <PlanSection billing={billing} onUpdateBilling={onUpdateBilling} />
      </PageSection>

      <PageSection
        id="payment"
        label="Payment method"
        sub="Cards are tokenized — we never see the full number."
      >
        <PaymentSection billing={billing} onUpdateBilling={onUpdateBilling} />
      </PageSection>

      <PageSection
        id="usage"
        label="Usage this month"
        sub="Resets on your renewal date. Soft caps — you'll get an email at 80%."
      >
        <UsageSection billing={billing} />
      </PageSection>

      <PageSection
        id="invoices"
        label="Invoices"
        sub="The last twelve are listed here. Older are available in the customer portal."
      >
        <InvoicesSection billing={billing} />
      </PageSection>

      <PageSection
        id="details"
        label="Billing details"
        sub="Used on every invoice. Update before your next renewal to apply."
      >
        <DetailsSection billing={billing} onUpdateBilling={onUpdateBilling} />
      </PageSection>

      <PageSection
        id="cancel"
        label="Cancel subscription"
        sub="Cancels at the end of your current billing period. You keep access until then."
      >
        <CancelSection billing={billing} onUpdateBilling={onUpdateBilling} />
      </PageSection>
    </PageShell>
  )
}
