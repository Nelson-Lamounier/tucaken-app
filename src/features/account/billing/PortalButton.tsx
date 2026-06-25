// src/features/account/billing/PortalButton.tsx
//
// Opens a Stripe-hosted Billing Portal session for the current customer.
// The portal lets the user:
//   · update / replace payment method
//   · view + pay past-due invoices
//   · cancel / change plan
//
// We don't reinvent these screens — Stripe maintains them PCI-compliant
// and i18n-ready. The portal is configured once in Dashboard → Settings →
// Billing → Customer portal (which features to expose).

import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { createPortalSessionFn } from '@/server/billing'

interface Props {
  customerId: string | null | undefined
  /** Path inside our app to land on after the portal closes. */
  returnPath?: string
  children?: React.ReactNode
  className?: string
}

export function PortalButton({
  customerId,
  returnPath = '/billing',
  children = 'Manage in Stripe',
  className = '',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    if (!customerId) {
      setError('No Stripe customer yet — subscribe to a paid plan first.')
      return
    }
    // Open the tab synchronously, inside the click gesture, so popup blockers
    // allow it — we point it at the Stripe URL once the session resolves. The
    // portal's return_url brings the user back to /billing inside that tab,
    // leaving our app untouched in the original tab. `opener` is severed so the
    // Stripe tab cannot script back into our window (reverse-tabnabbing).
    const portalTab = window.open('about:blank', '_blank')
    if (portalTab) portalTab.opener = null
    setLoading(true)
    setError(null)
    try {
      const { url } = await createPortalSessionFn({
        data: { customerId, returnPath },
      })
      if (portalTab) {
        portalTab.location.href = url
      } else {
        // Popup blocked — fall back to a same-tab redirect so the action works.
        window.location.assign(url)
      }
      setLoading(false)
    } catch (e) {
      portalTab?.close()
      setError(e instanceof Error ? e.message : 'Could not open portal.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={open}
        disabled={loading || !customerId}
        className={[
          'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50',
          className,
        ].join(' ')}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ExternalLink className="h-4 w-4" />
        )}
        {children}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  )
}
