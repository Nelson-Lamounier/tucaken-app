// src/server/stripe.ts
//
// Stripe SDK singleton + tier ↔ priceId lookup.
//
// SECURITY: this module is server-only. Importing it from a client bundle
// would leak STRIPE_SECRET_KEY. TanStack Start's `createServerFn` boundary
// strips this import from the client chunk; never import from a .tsx
// component file directly.

import Stripe from 'stripe'
import type { PlanId } from '@/features/account/types'
import type { TierConfig } from '@/features/billing/tier-config'
import { getAppOrigin } from './app-origin'

// -----------------------------------------------------------------------------
// SDK
// -----------------------------------------------------------------------------

let _stripe: Stripe | null = null

/** Lazy singleton — defers env access until first server call. */
export function stripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local (test mode key starts with sk_test_).',
    )
  }
  _stripe = new Stripe(key, {
    // Pin API version so Stripe SDK upgrades cannot silently change response shapes.
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
    appInfo: { name: 'tucaken-app', version: '0.1.0' },
  })
  return _stripe
}

// -----------------------------------------------------------------------------
// Tier → Stripe Price ID
// -----------------------------------------------------------------------------
//
// Checkout resolves prices from the admin-editable tier config (see
// priceIdForTierFromConfig below) — the env price vars below are retained only
// as a webhook-side safety net for mapping a Stripe price back to a tier when
// the config has not been set yet.

/** Inverse lookup — used by webhook to map a Stripe subscription back to a tier. */
export function tierForPriceId(priceId: string): PlanId | null {
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_MONTHLY) return 'premium'
  return null
}

// -----------------------------------------------------------------------------
// Origin helper (for return_url construction)
// -----------------------------------------------------------------------------

/**
 * Absolute URL of the current deployment. Used to build Checkout return_url
 * and Billing Portal return_url, which both require absolute URLs.
 */
export function appOrigin(): string {
  return getAppOrigin()
}

// -----------------------------------------------------------------------------
// Config-aware lookups (admin-editable tier config, env fallback)
// -----------------------------------------------------------------------------

// Seed sentinels written to the tier-config row when no real Stripe price has
// been set yet (admin-api seeds a paid tier with one to satisfy the schema's
// "paid tier needs an id" rule). They are NOT real Stripe prices — sending one
// to Stripe yields `No such price`. Treat them as "unset" so resolution falls
// back to the env price.
const PLACEHOLDER_PRICE_IDS = new Set(['n_placeholder', 'price_seed_placeholder'])

/**
 * True only for a value that looks like a real Stripe price ID — `price_…` and
 * not a known placeholder sentinel. Used to decide whether the admin-editable
 * config genuinely overrides the env price.
 */
function isRealPriceId(id: string | null | undefined): id is string {
  return typeof id === 'string' && id.startsWith('price_') && !PLACEHOLDER_PRICE_IDS.has(id)
}

/**
 * Resolves the Stripe monthly price ID for a paid tier from the admin-editable
 * tier config — the single source of truth for tier↔price mapping, owned by the
 * Settings → Subscription Tiers UI.
 *
 * A placeholder seed sentinel counts as "not configured": rather than silently
 * falling back to an env price (which can diverge from what the owner sees in
 * the UI), this throws an actionable error so the misconfiguration is obvious.
 *
 * @throws {Error} For the free tier (no Stripe price), or when the paid tier has
 *   no real Stripe price configured yet.
 */
export function priceIdForTierFromConfig(config: TierConfig | null, tier: PlanId): string {
  if (tier === 'free') throw new Error('Free tier has no Stripe price — do not call checkout.')
  const entry = config?.tiers.find((t) => t.id === tier)
  if (isRealPriceId(entry?.stripePriceIdMonthly)) return entry.stripePriceIdMonthly
  throw new Error(
    `No Stripe price is configured for the ${tier} tier. ` +
      'Set it in Settings → Subscription Tiers before starting checkout.',
  )
}

/**
 * Inverts a Stripe price ID back to a PlanId, preferring the admin-editable
 * config and falling back to the env-var lookup. Placeholder sentinels in the
 * config are ignored so a seed value can never masquerade as a real tier.
 *
 * @returns The matching PlanId, or null if the price ID is unknown.
 */
export function tierForPriceIdFromConfig(config: TierConfig | null, priceId: string): PlanId | null {
  const entry = config?.tiers.find(
    (t) => isRealPriceId(t.stripePriceIdMonthly) && t.stripePriceIdMonthly === priceId,
  )
  if (entry) return entry.id
  return tierForPriceId(priceId)
}
