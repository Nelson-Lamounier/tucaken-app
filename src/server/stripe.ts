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
  return (
    process.env.APP_ORIGIN ??
    process.env.VITE_APP_ORIGIN ??
    'http://localhost:5001'
  )
}
