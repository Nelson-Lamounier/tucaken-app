import { z } from 'zod'
import { LEGAL } from '@/features/legal/config'

/** Affirmative consent to immediate performance, asserted by the client. */
export const checkoutConsentSchema = z.object({
  termsAccepted: z.literal(true),
})

/** Stripe metadata values must be strings. */
export interface ConsentMetadata {
  terms_accepted: 'true'
  terms_version: string
  terms_accepted_at: string
}

/**
 * Server-authoritative consent record. The version is the canonical
 * `LEGAL.lastUpdated`; the timestamp is the server clock. Never trust the
 * client for either.
 */
export function buildConsentMetadata(now: Date): ConsentMetadata {
  return {
    terms_accepted: 'true',
    terms_version: LEGAL.lastUpdated,
    terms_accepted_at: now.toISOString(),
  }
}
