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
import { PortalButton } from './PortalButton'

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
      {/* Past-due banner: surface unpaid invoices at the top of the page with
          a one-click route into the Stripe Customer Portal to pay them. */}
      {billing.status === 'past_due' && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 flex-none text-amber-300" />
            <div>
              <p className="text-sm font-medium text-amber-100">
                Your last invoice is past due.
              </p>
              <p className="mt-1 text-xs text-amber-200/80">
                Pay it from the Stripe customer portal to keep your subscription
                active. We never see your card details.
              </p>
            </div>
          </div>
          <PortalButton
            customerId={billing.stripeCustomerId}
            returnPath="/billing"
            className="border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
          >
            Pay past-due invoice
          </PortalButton>
        </div>
      )}

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
        <PaymentSection billing={billing} />
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
        <DetailsSection billing={billing} />
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
