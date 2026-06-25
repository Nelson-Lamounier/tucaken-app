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

import Stripe from 'stripe'
import { createServerFn } from '@tanstack/react-start'
import { apiFetch } from './_api-client'
import { requireAdmin, requireAuth } from './auth-guard'
import { stripe } from './stripe'
import { TierConfigSchema, type TierConfig } from '@/features/billing/tier-config'

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
