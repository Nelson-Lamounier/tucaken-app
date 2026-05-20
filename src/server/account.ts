/**
 * @format
 * Account-termination server functions.
 *
 * Single export: `deleteAccountFn` — drives the full soft-delete flow.
 *
 * Order of operations:
 *   1. tryCancelSubscription          (Stripe — immediate cancel, no refund)
 *   2. POST /api/admin/me/delete      (admin-api: AdminDisableUser → soft-delete DB row)
 *   3. deleteCookie('__session')      (the caller's current session)
 *
 * Cognito AdminDisableUser is intentionally called by admin-api (NOT here)
 * because the tucaken-app pod has no IAM principal for cognito-idp:Admin*.
 * Centralising the privileged calls in admin-api keeps the IRSA blast
 * radius narrow: only one pod role can talk to Cognito as an administrator.
 *
 * Failure modes:
 *   - Stripe fails → user retries; Stripe accepts repeated cancel calls.
 *   - admin-api fails → Stripe is already cancelled (good), DB unchanged,
 *     Cognito unchanged. User stays signed in, can retry. Each step
 *     remains idempotent so retries converge on the right state.
 */

import { createServerFn } from '@tanstack/react-start'
import { deleteCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { stripe } from './stripe'
import { apiFetch } from './_api-client'
import { logger } from '@/lib/observability/logger'

const DeleteAccountInput = z.object({
  /** Free-text the user typed in the confirm form. Stored in admin-api. */
  reason: z.string().max(1000).optional(),
  /**
   * Echoed email — the UI requires the user to type their own email into a
   * field to confirm. We re-verify it server-side as defence-in-depth.
   */
  confirmEmail: z.string().email(),
})

interface MePlanProjection {
  email: string
  plan: {
    stripeSubscriptionId: string | null
  }
}

async function tryCancelSubscription(subscriptionId: string | null): Promise<void> {
  if (!subscriptionId) return
  try {
    await stripe().subscriptions.cancel(subscriptionId, {
      invoice_now: false,
      prorate:     false,
    })
  } catch (err) {
    // Stripe returns 404 if the subscription is already deleted — treat as
    // success because that's exactly the state we want.
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : ''
    if (code === 'resource_missing') return
    throw err
  }
}

export const deleteAccountFn = createServerFn({ method: 'POST' })
  .inputValidator(DeleteAccountInput)
  .handler(async ({ data }) => {
    const user = await requireAuth()

    // Defence-in-depth: confirm email matches the authenticated user. The
    // UI also enforces this; this is the server-side belt.
    if (user.email.toLowerCase() !== data.confirmEmail.toLowerCase()) {
      throw new Error('Confirmation email does not match the signed-in user.')
    }

    // We need the Stripe subscription ID to cancel; pull from /me.
    const me = await apiFetch<MePlanProjection>('/me', { pathTemplate: '/me' })

    logger.warn(
      { event: 'account_termination_started', userId: user.id },
      'starting account termination',
    )

    // 1. Stripe — cancel subscription immediately, no refund.
    await tryCancelSubscription(me.plan.stripeSubscriptionId)

    // 2. admin-api — disables Cognito then soft-deletes the DB row, as one
    // step from this side. The handler returns 502 if AdminDisableUser
    // throws and skips the DB write so retries are safe.
    try {
      await apiFetch<{ ok: true; alreadyDeleted: boolean }>('/me/delete', {
        method:       'POST',
        pathTemplate: '/me/delete',
        body:         JSON.stringify({ reason: data.reason ?? null }),
        headers:      { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      // Stripe is already cancelled — leaving us in a partially-deleted
      // state where the user can still sign in but their subscription is
      // gone. The webhook will sync `plan='free'` shortly. Surface the
      // error so the user can retry; retries are idempotent.
      logger.error(
        { event: 'account_termination_admin_api_failed', userId: user.id, err },
        'admin-api /me/delete failed after Stripe cancel — user retains login until retry',
      )
      throw err
    }

    // 3. End the current session.
    deleteCookie('__session', { path: '/' })

    logger.warn(
      { event: 'account_termination_completed', userId: user.id },
      'account termination completed; user signed out',
    )
    return { ok: true }
  })
