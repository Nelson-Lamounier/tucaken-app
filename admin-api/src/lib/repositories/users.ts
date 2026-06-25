/**
 * @format
 * UserRepository — typed pg queries for users + user_identities.
 *
 * Identity model (after migration 005):
 *
 *   users            — "who" — one row per real person, keyed by email.
 *   user_identities  — "how they log in" — one row per (user × provider).
 *
 * A single user can have multiple identity rows:
 *   { user_id: X, provider: 'google',  cognito_sub: 'uuid-A' }
 *   { user_id: X, provider: 'github',  cognito_sub: 'uuid-B' }
 *   { user_id: X, provider: 'email',   cognito_sub: 'uuid-C' }
 *
 * Linking strategy in upsertUser():
 *   1. Look up by cognito_sub in user_identities → fast path for returning user.
 *   2. Look up by email in users → links a new provider to an existing account
 *      (same person, second sign-in method).
 *   3. Insert a new users row and a new user_identities row → brand-new account.
 *      New users also get a 14-day reverse trial (migration 007).
 *
 * This prevents the duplicate-email crash that occurred when the same person
 * signed in with Google and then with email/password (both paths produce
 * different Cognito subs but the same email).
 *
 * Plan model (migration 007):
 *   Effective plan is derived at query time — no cron job needed:
 *     plan='pro' + subscription_status='active'  → Pro (paid)
 *     plan='free' + trial_ends_at > NOW()         → Trial (active)
 *     plan='free' + trial_ends_at <= NOW()        → Free (expired)
 */
import type { Pool, PoolClient } from 'pg';

/** Anything that exposes pg's `query()` — Pool or PoolClient. */
type Queryable = Pick<Pool, 'query'>;

export interface UserProfile {
  /** Cognito `sub` claim — stable per identity, not per person. */
  cognitoSub:      string;
  /** Identity provider — 'google' | 'github' | 'email'. */
  provider:        string;
  email:           string;
  fullName?:       string;
  avatarUrl?:      string;
  /** Provider's own user ID (Google UID, GitHub numeric ID). Undefined for email. */
  providerUserId?: string | undefined;
  /** RDS role to assign on first insert — 'user' | 'admin'. Defaults to 'user'. */
  role?:           string;
}

export interface ProvisionedUser {
  /** RDS users.id UUID — the stable FK anchor for all child tables. */
  id: string;
  /** True only when a brand-new users row was inserted (Step 3). False for returning users. */
  isNew: boolean;
}

/**
 * Returns true if a users row with the given email already exists.
 * Used at sign-up time to detect cross-provider duplicates before Cognito
 * creates a second native user (which would trigger AliasExistsException or
 * silently merge identities depending on pool config).
 */
export async function userExistsByEmail(pool: Pool, email: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1) AS exists`,
    [email],
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Resolves or creates a users row and links the Cognito identity to it.
 *
 * Idempotent — safe to call on every authenticated request.
 * Returns the stable users.id UUID for downstream query scoping.
 */
/**
 * Transactional core of upsertUser. The caller is responsible for the
 * surrounding BEGIN/COMMIT/ROLLBACK and for releasing the client.
 *
 * Split out from `upsertUser()` so that multi-step provisioning flows
 * (e.g. `provisionUserWithPendingLink`) can call this and additional
 * billing repo functions inside ONE transaction — preventing the race
 * where a user row commits but a follow-up step fails, leaving the
 * row in an inconsistent state with no retry path.
 */
export async function upsertUserInTransaction(
  client: PoolClient,
  user: UserProfile,
): Promise<ProvisionedUser> {
  // ── Step 1: fast path — identity already linked ───────────────────────────
  const existingIdentity = await client.query<{ user_id: string }>(
      `SELECT user_id FROM user_identities WHERE cognito_sub = $1`,
      [user.cognitoSub],
    );

  if (existingIdentity.rows[0]) {
    // Returning user — refresh profile fields that may have changed in the IdP
    await client.query(
      `UPDATE users
          SET full_name  = COALESCE($1, full_name),
              avatar_url = COALESCE($2, avatar_url),
              updated_at = NOW()
        WHERE id = $3`,
      [user.fullName ?? null, user.avatarUrl ?? null, existingIdentity.rows[0].user_id],
    );
    return { id: existingIdentity.rows[0].user_id, isNew: false };
  }

  // ── Step 2: same email, different provider — link new identity to existing user ──
  //
  // Example: signed up with Google, now signing in with GitHub using same email.
  // We merge rather than create a duplicate account.
  const existingUser = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [user.email],
  );

  let userId: string;
  let isNew = false;

  if (existingUser.rows[0]) {
    userId = existingUser.rows[0].id;

    // Update profile with any richer data from the new provider
    await client.query(
      `UPDATE users
          SET full_name  = COALESCE($1, full_name),
              avatar_url = COALESCE($2, avatar_url),
              updated_at = NOW()
        WHERE id = $3`,
      [user.fullName ?? null, user.avatarUrl ?? null, userId],
    );
  } else {
    // ── Step 3: brand-new user — create users row + start 14-day trial ───
    //
    // Admin accounts (role='admin') skip the trial — they get free access
    // permanently. The trial_started_at / trial_ends_at columns stay NULL.
    const isAdmin = (user.role ?? 'user') === 'admin';
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users
             (email, full_name, avatar_url, auth_provider, role,
              trial_started_at, trial_ends_at,
              created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5,
              $6, $7,
              NOW(), NOW())
      RETURNING id`,
      [
        user.email,
        user.fullName ?? null,
        user.avatarUrl ?? null,
        user.provider,
        user.role ?? 'user',
        isAdmin ? null : new Date(),
        isAdmin ? null : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('upsertUser: INSERT INTO users returned no row');
    userId = row.id;
    isNew  = true;

    // Audit: record trial start for non-admin users
    if (!isAdmin) {
      await client.query(
        `INSERT INTO plan_events (user_id, event_type, from_plan, to_plan, reason)
         VALUES ($1, 'trial_started', NULL, 'free', 'new_user_signup')`,
        [userId],
      );
    }
  }

  // ── Link the Cognito sub to this user (new identity row) ─────────────────
  //
  // ON CONFLICT (user_id, provider): handles two cases —
  //   1. Concurrent requests with the same sub both miss the pod cache and
  //      race to insert; the second is a no-op update to identical values.
  //   2. Sub rotation: Cognito user deleted + recreated (new sub, same email +
  //      provider). Step 1 above missed the old sub; we update it here so
  //      the user can sign in again without a 503.
  await client.query(
    `INSERT INTO user_identities
           (user_id, cognito_sub, provider, provider_user_id, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, provider) DO UPDATE
       SET cognito_sub      = EXCLUDED.cognito_sub,
           provider_user_id = EXCLUDED.provider_user_id`,
    [userId, user.cognitoSub, user.provider, user.providerUserId ?? null],
  );

  return { id: userId, isNew };
}

/**
 * Backwards-compatible wrapper: opens its own transaction.
 *
 * Use this for callers that DON'T need to atomically chain other writes
 * (e.g. unit tests, scripts). The user-provision middleware now uses
 * `provisionUserWithPendingLink` instead so the Stripe pending-link runs
 * inside the SAME transaction as the user insert.
 */
export async function upsertUser(pool: Pool, user: UserProfile): Promise<ProvisionedUser> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await upsertUserInTransaction(client, user);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export type EffectivePlan = 'free' | 'trial' | 'pro' | 'premium';

export interface PlanStatus {
  plan:                 string;          // stored column: 'free' | 'pro'
  effectivePlan:        EffectivePlan;   // derived: 'premium' | 'pro' | 'trial' | 'free'
  role:                 string;          // 'user' | 'admin'
  trialStartedAt:       Date | null;
  trialEndsAt:          Date | null;
  trialDaysRemaining:   number | null;   // null when no active trial
  subscriptionStatus:   string | null;
  stripeCustomerId:     string | null;
  stripeSubscriptionId: string | null;
  /** TRUE once user clicked Cancel; still active until current_period_end. */
  cancelAtPeriodEnd:    boolean;
  /** End of current Stripe billing period — used to render "Cancels on …". */
  currentPeriodEnd:     Date | null;
}

/**
 * Returns the plan status for a user, including effective plan derived from
 * trial dates and Stripe subscription state.
 *
 * Call this inside a withUser() transaction — the Queryable param is a
 * PoolClient with SET LOCAL app.current_user_id already applied.
 */
export async function getUserPlanStatus(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
): Promise<PlanStatus | null> {
  const result = await pool.query<{
    plan:                    string;
    role:                    string;
    trial_started_at:        Date | null;
    trial_ends_at:           Date | null;
    subscription_status:     string | null;
    stripe_customer_id:      string | null;
    stripe_subscription_id:  string | null;
    cancel_at_period_end:    boolean;
    current_period_end:      Date | null;
    effective_plan:          string;
    trial_days_remaining:    number | null;
  }>(
    `SELECT
       plan,
       role,
       trial_started_at,
       trial_ends_at,
       subscription_status,
       stripe_customer_id,
       stripe_subscription_id,
       cancel_at_period_end,
       current_period_end,
       CASE
         WHEN plan = 'premium' AND subscription_status = 'active' THEN 'premium'
         WHEN plan = 'pro'     AND subscription_status = 'active' THEN 'pro'
         WHEN plan = 'free'    AND trial_ends_at > NOW()          THEN 'trial'
         ELSE 'free'
       END AS effective_plan,
       CASE
         WHEN plan = 'free' AND trial_ends_at > NOW()
           THEN CEIL(EXTRACT(EPOCH FROM (trial_ends_at - NOW())) / 86400)::integer
         ELSE NULL
       END AS trial_days_remaining
     FROM users
    WHERE id = $1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    plan:                 row.plan,
    effectivePlan:        row.effective_plan as EffectivePlan,
    role:                 row.role,
    trialStartedAt:       row.trial_started_at,
    trialEndsAt:          row.trial_ends_at,
    trialDaysRemaining:   row.trial_days_remaining,
    subscriptionStatus:   row.subscription_status,
    stripeCustomerId:     row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    cancelAtPeriodEnd:    row.cancel_at_period_end,
    currentPeriodEnd:     row.current_period_end,
  };
}

/**
 * Increments the usage counter for a feature in the current month.
 * Returns the new count so the caller can enforce limits before the action.
 *
 * Pattern: call BEFORE the action, reject if count >= limit.
 */
export async function incrementUsageQuota(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
  feature: 'resume_generations' | 'job_applications' | 'coach_runs',
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `INSERT INTO usage_quotas (user_id, feature, period_month, count, updated_at)
          VALUES ($1, $2, DATE_TRUNC('month', NOW())::date, 1, NOW())
     ON CONFLICT (user_id, feature, period_month)
       DO UPDATE SET count      = usage_quotas.count + 1,
                     updated_at = NOW()
       RETURNING count`,
    [userId, feature],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Atomically checks and increments the monthly resume-generation counter.
 * Returns true if the generation is allowed (quota not exceeded), false otherwise.
 *
 * Uses a single INSERT … ON CONFLICT DO UPDATE … WHERE count < limit RETURNING count
 * so the check and increment are one atomic operation with no TOCTOU window.
 * If RETURNING yields no rows, the WHERE guard rejected the update → quota full.
 */
export async function checkAndIncrementResumeQuota(
    pool: Pick<import('pg').Pool, 'query'>,
    userId: string,
    limit: number,
): Promise<boolean> {
    if (!Number.isFinite(limit)) return true;
    const { rows } = await pool.query<{ count: number }>(
        `INSERT INTO usage_quotas (user_id, feature, period_month, count)
         VALUES ($1::uuid, 'resume_generations', DATE_TRUNC('month', NOW()), 1)
         ON CONFLICT (user_id, feature, period_month)
         DO UPDATE SET count      = usage_quotas.count + 1,
                       updated_at = NOW()
         WHERE usage_quotas.count < $2
         RETURNING count`,
        [userId, limit],
    );
    // Empty RETURNING → WHERE clause was false → quota already at or above limit.
    return rows.length > 0;
}

/**
 * Decrements the monthly resume-generation counter by 1 (floor 0).
 * Called when a generation dispatch fails after the quota was already incremented,
 * so a failed attempt does not burn the user's monthly credit.
 */
export async function decrementResumeQuota(
    pool: Pick<import('pg').Pool, 'query'>,
    userId: string,
): Promise<void> {
    await pool.query(
        `UPDATE usage_quotas
         SET count      = GREATEST(count - 1, 0),
             updated_at = NOW()
         WHERE user_id = $1::uuid AND feature = 'resume_generations'
           AND period_month = DATE_TRUNC('month', NOW())`,
        [userId],
    );
}

/**
 * Returns current usage count for a feature this month (0 if no row exists).
 */
export async function getUsageQuota(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
  feature: 'resume_generations' | 'job_applications' | 'coach_runs',
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count FROM usage_quotas
      WHERE user_id      = $1
        AND feature      = $2
        AND period_month = DATE_TRUNC('month', NOW())::date`,
    [userId, feature],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// ─── Account termination (soft delete with 30-day grace) ────────────────────

/**
 * Marks a user as soft-deleted. Sets `deleted_at = NOW()` and (optionally)
 * captures the free-text reason. Idempotent — calling on an already-deleted
 * user is a no-op (the original `deleted_at` is preserved so the grace clock
 * doesn't restart).
 *
 * Hard deletion is handled by `scripts/account-sweep.ts` running daily.
 *
 * Returns true on first deletion, false if already soft-deleted.
 */
export async function softDeleteUser(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
  reason: string | null,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE users
        SET deleted_at      = NOW(),
            deletion_reason = COALESCE(deletion_reason, $2)
      WHERE id = $1
        AND deleted_at IS NULL`,
    [userId, reason],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Lists users whose grace period has expired and who should be hard-deleted.
 * Returns the small set of fields the sweep needs to do its work (Cognito sub,
 * Stripe customer ID, S3 prefixes — left to the consumer to wire).
 */
export async function findUsersForHardDelete(
  pool: Pick<import('pg').Pool, 'query'>,
  graceDays: number,
): Promise<
  Array<{
    id:                   string;
    email:                string;
    deletedAt:            Date;
    stripeCustomerId:     string | null;
    stripeSubscriptionId: string | null;
  }>
> {
  const result = await pool.query<{
    id:                    string;
    email:                 string;
    deleted_at:            Date;
    stripe_customer_id:    string | null;
    stripe_subscription_id: string | null;
  }>(
    `SELECT id, email, deleted_at, stripe_customer_id, stripe_subscription_id
       FROM users
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - ($1 || ' days')::INTERVAL`,
    [String(graceDays)],
  );
  return result.rows.map((r) => ({
    id:                   r.id,
    email:                r.email,
    deletedAt:            r.deleted_at,
    stripeCustomerId:     r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
  }));
}

/**
 * Hard-deletes a user. Children cascade via FK ON DELETE CASCADE.
 *
 * Called only by the sweep — never expose to user-facing routes. The Cognito
 * AdminDeleteUser + Stripe customer delete + S3 purge happen *before* this
 * call so failures in those external systems don't leave dangling DB rows.
 */
export async function hardDeleteUser(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
): Promise<void> {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

/**
 * Restore a soft-deleted user during the grace window (support tool).
 * Clears `deleted_at` and the captured reason. No-op if user is active.
 */
export async function restoreSoftDeletedUser(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE users
        SET deleted_at = NULL, deletion_reason = NULL
      WHERE id = $1 AND deleted_at IS NOT NULL`,
    [userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Marks a trial nudge as delivered. Returns true on first delivery, false if
 * already delivered (idempotent — safe to call multiple times).
 */
export async function markTrialNudgeDelivered(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
  nudgeDay: 7 | 12,
): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO trial_nudges (user_id, nudge_day)
          VALUES ($1, $2)
     ON CONFLICT (user_id, nudge_day) DO NOTHING`,
    [userId, nudgeDay],
  );
  return (result.rowCount ?? 0) > 0;
}

// ─── Stripe / billing writes ─────────────────────────────────────────────────
//
// All writes below are called only by `/api/internal/billing/*` routes, which
// are gated by Cognito M2M authentication. Never expose these via user-JWT
// routes — clients must never set their own stripe_customer_id.

/** Plan IDs we accept from billing events (mirrors src/features/account/types.ts). */
export type BillingPlan = 'free' | 'pro' | 'premium';

/** Status values mirror the CHECK constraint in migration 007. */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

/**
 * The target user row does not exist (yet). Distinct from a conflict: the
 * caller (Stripe webhook) should RETRY, because provisioning may simply be
 * lagging — not skip the sync.
 */
export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} not found`);
    this.name = 'UserNotFoundError';
  }
}

/**
 * The user row already carries a *different* `stripe_customer_id`. A genuine
 * billing anomaly (duplicate customer) that must not be silently overwritten;
 * the caller should skip and leave it for manual reconciliation.
 */
export class StripeCustomerConflictError extends Error {
  constructor(
    public readonly userId: string,
    public readonly existingCustomerId: string | null,
    public readonly attemptedCustomerId: string,
  ) {
    super(
      `User ${userId} already has stripe_customer_id ${existingCustomerId} (refusing to overwrite with ${attemptedCustomerId})`,
    );
    this.name = 'StripeCustomerConflictError';
  }
}

/**
 * Idempotently attaches a Stripe customer ID to a user row.
 *
 * Called by the tucaken-app pre-checkout flow AND the Stripe webhook (which
 * self-heals the link): when an authenticated user first hits Checkout, we
 * create a Stripe customer with their email, then persist the resulting `cus_…`
 * here so future upgrades reuse the same customer record (one customer per
 * user, forever).
 *
 * Idempotent on (userId, customerId). If a row already has the same value,
 * this is a no-op. Otherwise it throws a *typed* error so callers can react
 * correctly: `UserNotFoundError` (retryable — provisioning may be lagging) vs
 * `StripeCustomerConflictError` (a different customer already linked — skip,
 * do not overwrite). Conflating the two as one status would let a webhook drop
 * a legitimate sync for a not-yet-provisioned user.
 */
export async function setStripeCustomerId(
  pool: Pick<import('pg').Pool, 'query'>,
  userId: string,
  customerId: string,
): Promise<void> {
  const result = await pool.query<{ stripe_customer_id: string | null }>(
    `UPDATE users
        SET stripe_customer_id = $2
      WHERE id = $1
        AND (stripe_customer_id IS NULL OR stripe_customer_id = $2)
      RETURNING stripe_customer_id`,
    [userId, customerId],
  );
  if (result.rowCount === 0) {
    // Either the user does not exist or it already has a *different* customer.
    const row = await pool.query<{ stripe_customer_id: string | null }>(
      `SELECT stripe_customer_id FROM users WHERE id = $1`,
      [userId],
    );
    if (row.rowCount === 0) {
      throw new UserNotFoundError(userId);
    }
    throw new StripeCustomerConflictError(
      userId,
      row.rows[0]?.stripe_customer_id ?? null,
      customerId,
    );
  }
}

/**
 * Resolves a Stripe customer back to our user row. Used by webhook handlers
 * to find which local user a Stripe event applies to.
 */
export async function findUserByStripeCustomerId(
  pool: Pick<import('pg').Pool, 'query'>,
  customerId: string,
): Promise<{ id: string; email: string } | null> {
  const result = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE stripe_customer_id = $1`,
    [customerId],
  );
  return result.rows[0] ?? null;
}

/**
 * Applies a subscription state change from Stripe to a user row.
 *
 * Called from webhook handlers (`customer.subscription.updated/deleted`,
 * `invoice.{paid,payment_failed}`). Conditional update protects against
 * out-of-order delivery — Stripe replays older events on transient 5xx,
 * and we don't want a stale `past_due` overwriting a newer `active`.
 *
 * Returns true when a row was updated; false if the customer is unknown.
 */
export async function updateSubscriptionFromStripe(
  pool: Pick<import('pg').Pool, 'query'>,
  customerId: string,
  patch: {
    plan?:                 BillingPlan | undefined;
    stripeSubscriptionId?: string | null | undefined;
    subscriptionStatus?:   SubscriptionStatus | null | undefined;
    cancelAtPeriodEnd?:    boolean | undefined;
    /**
     * ISO timestamp string (from Stripe `current_period_end`). The Postgres
     * driver coerces ISO 8601 strings into TIMESTAMPTZ natively.
     */
    currentPeriodEnd?:     string | null | undefined;
  },
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE users
        SET plan                   = COALESCE($2, plan),
            stripe_subscription_id = COALESCE($3, stripe_subscription_id),
            subscription_status    = COALESCE($4, subscription_status),
            cancel_at_period_end   = COALESCE($5, cancel_at_period_end),
            current_period_end     = COALESCE($6, current_period_end)
      WHERE stripe_customer_id = $1`,
    [
      customerId,
      patch.plan ?? null,
      patch.stripeSubscriptionId ?? null,
      patch.subscriptionStatus ?? null,
      patch.cancelAtPeriodEnd ?? null,
      patch.currentPeriodEnd ?? null,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Inserts a guest-checkout pending row. Called from the webhook when the
 * `checkout.session.completed` event has no `client_reference_id` (i.e. an
 * unauthenticated buyer paid from the home /pricing page).
 *
 * Email is normalised to lower-case to match the sign-up matcher.
 * Upserts on stripe_customer_id so re-fired webhooks update in place.
 */
export async function upsertPendingSubscription(
  pool: Pick<import('pg').Pool, 'query'>,
  row: {
    email:                 string;
    stripeCustomerId:      string;
    stripeSubscriptionId:  string;
    plan:                  Exclude<BillingPlan, 'free'>;
    subscriptionStatus:    SubscriptionStatus;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO pending_subscriptions (
        email, stripe_customer_id, stripe_subscription_id, plan, subscription_status
      ) VALUES (LOWER($1), $2, $3, $4, $5)
      ON CONFLICT (stripe_customer_id)
      DO UPDATE SET
        email                  = EXCLUDED.email,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        plan                   = EXCLUDED.plan,
        subscription_status    = EXCLUDED.subscription_status`,
    [
      row.email,
      row.stripeCustomerId,
      row.stripeSubscriptionId,
      row.plan,
      row.subscriptionStatus,
    ],
  );
}

/**
 * Drains a pending subscription row (if any) and stamps the Stripe fields
 * onto the user. Called by `provisionUserWithPendingLink()` inside the
 * same transaction as the user insert.
 *
 * Returns the consumed pending row (for telemetry) or null. Idempotent —
 * subsequent calls find nothing and short-circuit.
 *
 * Notes
 * -----
 *   · Email comparison is LOWER()-based to defend against case mismatches
 *     between Stripe-collected emails and Cognito-stored emails.
 *   · The UPDATE is guarded by `stripe_customer_id IS NULL` — once a user
 *     is linked to a Stripe customer, we never overwrite it from a pending
 *     row. A duplicate pending row in that state indicates a webhook bug
 *     and is left in place for ops to investigate (visible via the
 *     `stripe_pending_orphan` log line below).
 */
export async function consumePendingSubscriptionForUser(
  q: Queryable,
  userId: string,
  email: string,
): Promise<{
  stripeCustomerId:     string;
  stripeSubscriptionId: string;
  plan:                 BillingPlan;
  subscriptionStatus:   SubscriptionStatus;
} | null> {
  const pending = await q.query<{
    stripe_customer_id:     string;
    stripe_subscription_id: string;
    plan:                   BillingPlan;
    subscription_status:    SubscriptionStatus;
  }>(
    `DELETE FROM pending_subscriptions
      WHERE email = LOWER($1)
      RETURNING stripe_customer_id, stripe_subscription_id, plan, subscription_status`,
    [email],
  );
  const row = pending.rows[0];
  if (!row) return null;

  const updated = await q.query(
    `UPDATE users
        SET stripe_customer_id     = $2,
            stripe_subscription_id = $3,
            plan                   = $4,
            subscription_status    = $5
      WHERE id = $1
        AND stripe_customer_id IS NULL`,
    [
      userId,
      row.stripe_customer_id,
      row.stripe_subscription_id,
      row.plan,
      row.subscription_status,
    ],
  );

  if ((updated.rowCount ?? 0) === 0) {
    // The user already had a different Stripe customer linked. We've
    // already consumed (DELETE'd) the pending row, so re-insert it so
    // an operator can reconcile manually. Throwing here would also roll
    // back the user insert in the atomic flow, which is much worse than
    // a stale pending row.
    await q.query(
      `INSERT INTO pending_subscriptions
              (email, stripe_customer_id, stripe_subscription_id, plan, subscription_status)
       VALUES (LOWER($1), $2, $3, $4, $5)
       ON CONFLICT (stripe_customer_id) DO NOTHING`,
      [
        email,
        row.stripe_customer_id,
        row.stripe_subscription_id,
        row.plan,
        row.subscription_status,
      ],
    );
    return null;
  }

  return {
    stripeCustomerId:     row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    plan:                 row.plan,
    subscriptionStatus:   row.subscription_status,
  };
}

/**
 * Atomic provisioning + Stripe pending-link.
 *
 * Closes the race window described in `docs/billing-integration.md`: if
 * the link step throws after the user insert commits, the user has
 * `plan='free'` forever even though they paid.
 *
 * Fix: open a single PoolClient, BEGIN once, run `upsertUserInTransaction`
 * AND `consumePendingSubscriptionForUser` inside the same transaction. Any
 * thrown error ROLLBACKs both. Because the in-process sub→userId cache is
 * set by the caller (user-provision middleware) only *after* this function
 * returns, a rolled-back attempt naturally retries on the next request.
 *
 * For returning users (isNew=false), `stripe_customer_id` may still be
 * NULL — they might have paid as a guest AFTER signing up under the free
 * tier. We attempt the link regardless; the DELETE in
 * `consumePendingSubscriptionForUser` is a no-op when no pending row
 * matches the email.
 */
export async function provisionUserWithPendingLink(
  pool: Pool,
  user: UserProfile,
): Promise<{
  id: string;
  isNew: boolean;
  linkedSubscription: {
    stripeCustomerId:     string;
    stripeSubscriptionId: string;
    plan:                 BillingPlan;
    subscriptionStatus:   SubscriptionStatus;
  } | null;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const provisioned = await upsertUserInTransaction(client, user);
    const linked = await consumePendingSubscriptionForUser(
      client,
      provisioned.id,
      user.email,
    );
    await client.query('COMMIT');
    return { ...provisioned, linkedSubscription: linked };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Admin user listing (no RLS) ─────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: 'user' | 'admin';
  plan: 'free' | 'pro' | 'premium';
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

const ADMIN_TIERS = new Set(['free', 'pro', 'premium']);

/**
 * Admin-only list of all users. MUST run on the superuser pool (NOT withUser)
 * so RLS does not restrict the result to a single row.
 */
export async function listUsers(
  pool: Pick<import('pg').Pool, 'query'>,
  opts: { tier: 'all' | 'free' | 'pro' | 'premium'; limit: number; offset: number },
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const hasTier = opts.tier !== 'all' && ADMIN_TIERS.has(opts.tier);
  const where = hasTier ? 'WHERE plan = $1' : '';
  const countParams = hasTier ? [opts.tier] : [];

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM users ${where}`,
    countParams,
  );
  const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

  const limitIdx = hasTier ? '$2' : '$1';
  const offsetIdx = hasTier ? '$3' : '$2';
  const listParams = hasTier
    ? [opts.tier, opts.limit, opts.offset]
    : [opts.limit, opts.offset];

  const result = await pool.query<{
    id: string; email: string; full_name: string | null;
    role: string; plan: string; subscription_status: string | null;
    trial_ends_at: Date | null; deleted_at: Date | null; created_at: Date;
  }>(
    `SELECT id, email, full_name, role, plan, subscription_status,
            trial_ends_at, deleted_at, created_at
       FROM users
       ${where}
      ORDER BY created_at DESC
      LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
    listParams,
  );

  const rows: AdminUserRow[] = result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role === 'admin' ? 'admin' : 'user',
    plan: toPlan(r.plan),
    subscriptionStatus: r.subscription_status,
    trialEndsAt: r.trial_ends_at ? r.trial_ends_at.toISOString() : null,
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  }));
  return { rows, total };
}

function toPlan(value: string): 'free' | 'pro' | 'premium' {
  if (value === 'pro') return 'pro';
  if (value === 'premium') return 'premium';
  return 'free';
}

export interface AdminUserDetailRow extends AdminUserRow {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  quotas: { feature: string; periodMonth: string; count: number }[];
}

export async function getAdminUserById(
  pool: Pick<import('pg').Pool, 'query'>,
  id: string,
): Promise<AdminUserDetailRow | null> {
  const userResult = await pool.query<{
    id: string; email: string; full_name: string | null; role: string; plan: string;
    subscription_status: string | null; trial_ends_at: Date | null; deleted_at: Date | null;
    created_at: Date; stripe_customer_id: string | null; stripe_subscription_id: string | null;
    current_period_end: Date | null; cancel_at_period_end: boolean;
  }>(
    `SELECT id, email, full_name, role, plan, subscription_status, trial_ends_at,
            deleted_at, created_at, stripe_customer_id, stripe_subscription_id,
            current_period_end, cancel_at_period_end
       FROM users WHERE id = $1`,
    [id],
  );
  const u = userResult.rows[0];
  if (!u) return null;

  const quotaResult = await pool.query<{ feature: string; period_month: string; count: number }>(
    `SELECT feature, period_month, count
       FROM usage_quotas WHERE user_id = $1
      ORDER BY period_month DESC, feature ASC`,
    [id],
  );

  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role === 'admin' ? 'admin' : 'user',
    plan: toPlan(u.plan),
    subscriptionStatus: u.subscription_status,
    trialEndsAt: u.trial_ends_at ? u.trial_ends_at.toISOString() : null,
    deletedAt: u.deleted_at ? u.deleted_at.toISOString() : null,
    createdAt: u.created_at.toISOString(),
    stripeCustomerId: u.stripe_customer_id,
    stripeSubscriptionId: u.stripe_subscription_id,
    currentPeriodEnd: u.current_period_end ? u.current_period_end.toISOString() : null,
    cancelAtPeriodEnd: u.cancel_at_period_end,
    quotas: quotaResult.rows.map((q) => ({
      feature: q.feature, periodMonth: q.period_month, count: Number(q.count),
    })),
  };
}
