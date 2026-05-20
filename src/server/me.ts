/**
 * @format
 * Current-user server function — calls GET /api/admin/me.
 *
 * This is the trigger for user provisioning: the first call after sign-in
 * causes userProvisionMiddleware to upsert the users row in RDS.
 * Safe to call on every dashboard load — the upsert is idempotent.
 */

import { createServerFn } from '@tanstack/react-start'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

export interface MeResponse {
  id:        string
  email:     string
  name?:     string
  avatarUrl?: string
  /** True only on the first-ever sign-in — authoritative signal from the DB insert. */
  isNew:     boolean
  plan: {
    plan:                 string
    effectivePlan:        'pro' | 'trial' | 'free'
    role:                 string   // 'user' | 'admin' — already returned by the API
    trialStartedAt:       string | null
    trialEndsAt:          string | null
    trialDaysRemaining:   number | null
    subscriptionStatus:   string | null
    stripeCustomerId:     string | null
    stripeSubscriptionId: string | null
    /** TRUE once user clicked Cancel; access remains until currentPeriodEnd. */
    cancelAtPeriodEnd:    boolean
    /** ISO 8601 — end of current Stripe billing period. */
    currentPeriodEnd:     string | null
  }
}

export const getMeFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MeResponse> => {
    await requireAuth()
    return apiFetch<MeResponse>('/me')
  },
)
