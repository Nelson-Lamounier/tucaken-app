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
// Price IDs are environment-specific (test vs live each have separate IDs).
// The mapping lives in env vars so the same code ships across envs.

export function priceIdForTier(tier: PlanId): string {
  switch (tier) {
    case 'pro':
      return required('STRIPE_PRICE_PRO_MONTHLY')
    case 'premium':
      return required('STRIPE_PRICE_PREMIUM_MONTHLY')
    case 'free':
      throw new Error('Free tier has no Stripe price — do not call checkout.')
  }
}

/** Inverse lookup — used by webhook to map a Stripe subscription back to a tier. */
export function tierForPriceId(priceId: string): PlanId | null {
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_MONTHLY) return 'premium'
  return null
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set in env.`)
  return v
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

/**
 * Resolves the Stripe monthly price ID for a paid tier, preferring the
 * admin-editable config when a price ID is set there, and falling back to
 * the env-var lookup when not.
 *
 * @throws {Error} Always throws for the free tier — it has no Stripe price.
 */
export function priceIdForTierFromConfig(config: TierConfig | null, tier: PlanId): string {
  if (tier === 'free') throw new Error('Free tier has no Stripe price — do not call checkout.')
  const entry = config?.tiers.find((t) => t.id === tier)
  if (entry?.stripePriceIdMonthly) return entry.stripePriceIdMonthly
  return priceIdForTier(tier)
}

/**
 * Inverts a Stripe price ID back to a PlanId, preferring the admin-editable
 * config and falling back to the env-var lookup.
 *
 * @returns The matching PlanId, or null if the price ID is unknown.
 */
export function tierForPriceIdFromConfig(config: TierConfig | null, priceId: string): PlanId | null {
  const entry = config?.tiers.find((t) => t.stripePriceIdMonthly === priceId)
  if (entry) return entry.id
  return tierForPriceId(priceId)
}
