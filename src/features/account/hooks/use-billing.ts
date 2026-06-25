import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Billing, BillingStatus, PlanId } from '../types'
import { DEFAULT_BILLING } from '../defaults'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'

function planFromApi(raw: string): PlanId {
  if (raw === 'pro' || raw === 'premium') return raw
  // Accept legacy 'team' from backend until admin-api migrates the column.
  if (raw === 'team') return 'premium'
  return 'free'
}

function statusFromApi(sub: string | null, trialEndsAt: string | null): BillingStatus {
  if (sub === 'trialing' || (!sub && trialEndsAt)) return 'trialing'
  if (sub === 'past_due')  return 'past_due'
  if (sub === 'canceled')  return 'canceled'
  return 'active'
}

export function useBilling() {
  const { data: me, isLoading } = useQuery({
    queryKey: adminKeys.me.detail(),
    queryFn:  getMeFn,
  })

  const billing = useMemo<Billing>(() => {
    if (!me?.plan) return DEFAULT_BILLING
    const p = me.plan
    return {
      ...DEFAULT_BILLING,
      plan:               planFromApi(p.plan),
      status:             statusFromApi(p.subscriptionStatus, p.trialEndsAt),
      trialEndsAt:        p.trialEndsAt ?? null,
      stripeCustomerId:     p.stripeCustomerId ?? null,
      stripeSubscriptionId: p.stripeSubscriptionId ?? null,
      cancelAtPeriodEnd:    Boolean(p.cancelAtPeriodEnd),
      // `current_period_end` is the cliff date for both "renews on" and
      // "cancels on" — same column, different label depending on
      // cancelAtPeriodEnd. We populate renewsAt; the UI re-uses it.
      renewsAt:           p.currentPeriodEnd ?? DEFAULT_BILLING.renewsAt,
    }
  }, [me])

  // No backend mutation endpoint yet — update is a no-op until Stripe lands.
  const update = useCallback((_patch: Partial<Billing>) => {}, [])

  return { billing, update, isLoading }
}
