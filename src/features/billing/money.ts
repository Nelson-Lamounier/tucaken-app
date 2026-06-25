// src/features/billing/money.ts
//
// Currency helpers for Stripe price creation. We only offer two-decimal
// currencies from the admin editor, so the major→minor conversion is a simple
// ×100. Zero-decimal currencies (JPY, KRW, …) are intentionally excluded to
// avoid an incorrect ×100.

/** Currencies the admin editor may create a Stripe price in (all two-decimal). */
export const ALLOWED_PRICE_CURRENCIES = ['eur', 'usd', 'gbp'] as const

export type PriceCurrency = (typeof ALLOWED_PRICE_CURRENCIES)[number]

/**
 * Convert a major-unit amount (e.g. 35.00) to Stripe minor units (e.g. 3500).
 * Rounds to the nearest minor unit to absorb floating-point noise.
 */
export function toMinorUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100)
}
