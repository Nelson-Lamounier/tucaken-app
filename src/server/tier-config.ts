/**
 * Server functions for admin-editable subscription tier configuration.
 *
 * - getTierConfigFn    — fetches the current config from admin-api
 * - updateTierConfigFn — persists a new config via admin-api
 * - listStripePricesFn — lists active Stripe prices for the admin UI picker
 *
 * SECURITY: the read (getTierConfigFn) requires authentication — it feeds the
 * pricing catalog, so any signed-in user may read it. The write
 * (updateTierConfigFn) and the Stripe price enumeration (listStripePricesFn)
 * require the admin role server-side via requireAdmin — never rely on the
 * client-side UI gate. updateTierConfigFn also validates the request body
 * against TierConfigSchema before forwarding.
 */

import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { apiFetch } from './_api-client'
import { requireAdmin, requireAuth } from './auth-guard'
import { stripe } from './stripe'
import {
  TierConfigSchema,
  type TierConfig,
  type PublicTierConfig,
} from '@/features/billing/tier-config'
import { toMinorUnits, ALLOWED_PRICE_CURRENCIES } from '@/features/billing/money'

// -----------------------------------------------------------------------------
// GET /api/admin/tier-config
// -----------------------------------------------------------------------------

export const getTierConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TierConfig> => {
    await requireAuth()
    return apiFetch<TierConfig>('/tier-config')
  },
)

// -----------------------------------------------------------------------------
// GET /api/public/tier-config — unauthenticated, display-only projection.
// Feeds the public pricing surfaces (home + /pricing) so admin price edits are
// reflected without exposing entitlements or Stripe price IDs.
//
// Uses a raw fetch (not apiFetch) because the marketing pages are anonymous:
// apiFetch requires the `__session` cookie and throws without it. Mirrors the
// public `email-exists` call in auth.ts.
// -----------------------------------------------------------------------------

const ADMIN_API_URL = process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

export const getPublicTierConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublicTierConfig> => {
    const res = await fetch(`${ADMIN_API_URL}/api/public/tier-config`)
    if (!res.ok) {
      throw new Error(`public tier-config fetch failed [${res.status}]`)
    }
    return (await res.json()) as PublicTierConfig
  },
)

// -----------------------------------------------------------------------------
// PUT /api/admin/tier-config
// -----------------------------------------------------------------------------

export const updateTierConfigFn = createServerFn({ method: 'POST' })
  .inputValidator(TierConfigSchema)
  .handler(async ({ data }): Promise<{ updated: true }> => {
    await requireAdmin()
    return apiFetch<{ updated: true }>('/tier-config', {
      method: 'PUT',
      pathTemplate: '/tier-config',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    })
  })

// -----------------------------------------------------------------------------
// List active Stripe prices
// -----------------------------------------------------------------------------

function extractProductName(product: Stripe.Price['product']): string | null {
  if (typeof product === 'object' && product !== null && 'name' in product) {
    return product.name
  }
  return null
}

export const listStripePricesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  const res = await stripe().prices.list({ active: true, expand: ['data.product'], limit: 100 })
  return res.data.map((p) => ({
    id: p.id,
    nickname: p.nickname ?? null,
    unitAmount: p.unit_amount ?? null,
    currency: p.currency,
    productName: extractProductName(p.product),
  }))
})

// -----------------------------------------------------------------------------
// Create a Stripe Product + monthly Price for a paid tier (admin-only).
//
// The created objects land in whatever MODE the deployment's STRIPE_SECRET_KEY
// is: a test key creates test objects, a live key creates live objects — so a
// test deployment never touches the live account. Returns the new price id so
// the editor can map the tier to it.
// -----------------------------------------------------------------------------

const CreateTierPriceInput = z.object({
  tier: z.enum(['pro', 'premium']),
  /** Display amount in major units (e.g. 35 for EUR 35.00). */
  amount: z.number().positive(),
  currency: z.enum(ALLOWED_PRICE_CURRENCIES),
})

export const createTierStripePriceFn = createServerFn({ method: 'POST' })
  .inputValidator(CreateTierPriceInput)
  .handler(async ({ data }): Promise<{ priceId: string; productId: string; unitAmount: number; currency: string }> => {
    await requireAdmin()
    const unitAmount = toMinorUnits(data.amount)
    const name = data.tier === 'pro' ? 'Tucaken Pro' : 'Tucaken Premium'

    const product = await stripe().products.create(
      { name },
      { idempotencyKey: randomUUID() },
    )
    const price = await stripe().prices.create(
      {
        product: product.id,
        unit_amount: unitAmount,
        currency: data.currency,
        recurring: { interval: 'month' },
      },
      { idempotencyKey: randomUUID() },
    )

    return { priceId: price.id, productId: product.id, unitAmount, currency: data.currency }
  })
