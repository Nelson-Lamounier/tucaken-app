export type UserTier = 'free' | 'pro' | 'premium'
export type UserRole = 'user' | 'admin'

export interface AdminUserSummary {
  readonly id: string
  readonly email: string
  readonly fullName: string | null
  readonly role: UserRole
  readonly plan: UserTier
  readonly subscriptionStatus: string | null
  readonly trialEndsAt: string | null
  readonly deletedAt: string | null
  readonly createdAt: string
}

export interface UserQuota {
  readonly feature: string
  readonly periodMonth: string
  readonly count: number
}

export interface AdminUserDetail extends AdminUserSummary {
  readonly stripeCustomerId: string | null
  readonly stripeSubscriptionId: string | null
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
  readonly quotas: readonly UserQuota[]
}
