import type { UserTier, UserRole } from '../types'

export const TIER_FILTER_OPTIONS: readonly { value: UserTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All Users' },
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'premium', label: 'Premium' },
]

export const PLAN_LABELS: Record<UserTier, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
}

export const PLAN_COLOURS: Record<UserTier, string> = {
  free: 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30',
  pro: 'bg-violet-50 text-violet-700 border-violet-600/20 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  premium: 'bg-amber-50 text-amber-800 border-amber-600/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
}

export const ROLE_COLOURS: Record<UserRole, string> = {
  user: 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30',
  admin: 'bg-teal-50 text-teal-700 border-teal-600/20 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30',
}
