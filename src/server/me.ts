/**
 * @format
 * Current-user server function — calls GET /api/admin/me.
 *
 * This is the trigger for user provisioning: the first call after sign-in
 * causes userProvisionMiddleware to upsert the users row in RDS.
 * Safe to call on every dashboard load — the upsert is idempotent.
 */

import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { requireAuth } from './auth-guard'

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

function getSessionToken(): string {
  const token = getCookie('__session')
  if (!token) throw new Error('Session cookie missing after auth guard')
  return token
}

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
    trialStartedAt:       string | null
    trialEndsAt:          string | null
    trialDaysRemaining:   number | null
    subscriptionStatus:   string | null
    stripeCustomerId:     string | null
    stripeSubscriptionId: string | null
  }
}

export const getMeFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MeResponse> => {
    await requireAuth()

    const res = await fetch(`${ADMIN_API_URL}/api/admin/me`, {
      headers: {
        Authorization: `Bearer ${getSessionToken()}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`[me] admin-api responded ${res.status}`)
    }

    return res.json() as Promise<MeResponse>
  },
)
