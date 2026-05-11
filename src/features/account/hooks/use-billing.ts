import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Billing, BillingStatus, PlanId } from '../types'
import { DEFAULT_BILLING } from '../defaults'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'

function planFromApi(raw: string): PlanId {
  if (raw === 'pro' || raw === 'team') return raw
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
      plan:         planFromApi(p.plan),
      status:       statusFromApi(p.subscriptionStatus, p.trialEndsAt),
      trialEndsAt:  p.trialEndsAt ?? null,
      billingEmail: me.email,
    }
  }, [me])

  // No backend mutation endpoint yet — update is a no-op until Stripe lands.
  const update = useCallback((_patch: Partial<Billing>) => {}, [])

  return { billing, update, isLoading }
}
