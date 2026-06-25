import type { InterviewStage } from '@/lib/types/applications.types'
import { STAGE_ORDER } from './stage'

/** The viewer dimensions gating is resolved against (built from `me`). */
export interface StageViewer {
  readonly id: string
  readonly email: string
  readonly role: string                 // 'user' | 'admin'
  readonly tier: 'pro' | 'trial' | 'free'
}

/** Default for every viewer not matched by an allow rule. Must contain 'applied'. */
export const DEFAULT_ENABLED_STAGES: ReadonlySet<InterviewStage> = new Set(['applied'])

interface AccessRules {
  readonly roles: ReadonlySet<string>
  readonly emails: ReadonlySet<string>
  readonly ids: ReadonlySet<string>
  readonly tiers: ReadonlySet<string>
}

/** Match ANY field → ALL stages enabled. Launch: admins + seeded emails/ids. */
const ALLOW: AccessRules = {
  roles: new Set(['admin']),
  emails: new Set<string>([]),          // add tester/design-partner emails here
  ids: new Set<string>([]),             // add specific user ids here
  tiers: new Set<string>([]),           // add 'pro' to tie the feature to the paid tier later
}

/** Match ANY field → locked to DEFAULT. Deny wins over allow. Empty at launch. */
const DENY: AccessRules = {
  roles: new Set<string>([]),
  emails: new Set<string>(['blocked@example.com']),  // seed so the deny-wins test is meaningful; real deny entries added as needed
  ids: new Set<string>([]),
  tiers: new Set<string>([]),
}

function matchesAny(rules: AccessRules, viewer: StageViewer): boolean {
  return rules.roles.has(viewer.role)
    || rules.emails.has(viewer.email)
    || rules.ids.has(viewer.id)
    || rules.tiers.has(viewer.tier)
}

/** Resolve which stages this viewer may open. Order: deny → allow → default. */
export function enabledStagesFor(viewer: StageViewer | null): ReadonlySet<InterviewStage> {
  if (!viewer) return DEFAULT_ENABLED_STAGES
  if (matchesAny(DENY, viewer)) return DEFAULT_ENABLED_STAGES
  if (matchesAny(ALLOW, viewer)) return new Set(STAGE_ORDER)
  return DEFAULT_ENABLED_STAGES
}

export function isStageEnabledFor(stage: InterviewStage, viewer: StageViewer | null): boolean {
  return enabledStagesFor(viewer).has(stage)
}
