// src/features/account/billing/plans.ts
//
// Compatibility shim. The real plan catalog now lives in
// `@/features/billing/catalog` so it can be shared between the home
// PricingSection, the public /pricing route, the dashboard billing UI,
// and the server-side checkout flow.
//
// PlanSection.tsx still imports `PLANS` and `planRank` from here — we
// re-shape the central catalog into the legacy `PlanDefinition` shape
// expected by that component.

import type { PlanId } from '../types'
import { TIERS, tierRank } from '@/features/billing/catalog'

export interface PlanDefinition {
  id: PlanId
  name: string
  /** Monthly EUR price. */
  price: number
  /** Yearly EUR price. */
  yearly: number
  popular?: boolean
  blurb: string
  features: string[]
}

export const PLANS: PlanDefinition[] = TIERS.map((t) => ({
  id: t.id,
  name: t.name,
  price: t.priceMonthly,
  yearly: t.priceAnnual,
  popular: t.highlighted,
  blurb: t.blurb,
  features: t.features,
}))

export const planRank = tierRank
