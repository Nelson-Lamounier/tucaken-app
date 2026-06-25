// Maps a tier to its CTA navigation target. Free tiers go to sign-in;
// paid tiers go to the checkout route keyed by tier id. Kept React-free so
// the routing logic is unit-testable without a router/query context.
import type { Tier } from '@/features/billing/catalog'

export type CtaTarget =
  | { to: '/sign-in' }
  | { to: '/checkout/$tier'; params: { tier: 'pro' | 'premium' } }

export function tierCtaTarget(tier: Tier): CtaTarget {
  if (tier.free) return { to: '/sign-in' }
  // Free tiers short-circuited above, so id is 'pro' | 'premium' here —
  // TS cannot narrow a string union from the boolean `free` flag.
  return { to: '/checkout/$tier', params: { tier: tier.id as 'pro' | 'premium' } }
}
