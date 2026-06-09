import { CheckCircle2, AlertTriangle, XCircle, Target, Sparkles, Handshake } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tone } from '@/components/ui/tone'
import type {
  ApplicationDetail,
  ApplicationStatus,
  InterviewStage,
  FitRating,
  StageState,
} from '@/lib/types/applications.types'
import { STAGE_ORDER, stageIndex } from '../stages/types/stage'
import { STAGE_LABELS, FIT_RATING_LABELS } from '../components/ApplicationTypes'

/** One KB-style "at a glance" tile. */
export interface GlanceTileData {
  readonly key: string
  /** Small uppercase label above the value. */
  readonly label: string
  /** Hero value — numeric strings render larger than word values. */
  readonly value: string
  readonly name: string
  readonly sub?: string
  readonly tone: Tone
  readonly icon: LucideIcon
  /** When set, the tile renders a segmented level meter instead of a hero value. */
  readonly meter?: { readonly level: number; readonly max: number }
  /** When set, the tile counts the value up and shows a share-of-total bar. */
  readonly share?: { readonly value: number; readonly total: number }
}

const FIT_TONE: Record<FitRating, Tone> = {
  STRONG_FIT: 'good',
  REASONABLE_FIT: 'good',
  STRETCH: 'warn',
  REACH: 'bad',
}

/** Ordinal rank of each fit rating — drives the level meter (4 = best). */
const FIT_LEVEL: Record<FitRating, number> = {
  STRONG_FIT: 4,
  REASONABLE_FIT: 3,
  STRETCH: 2,
  REACH: 1,
}

function fitTile(detail: ApplicationDetail): GlanceTileData {
  const rating = detail.research?.fitRating
  if (!rating) {
    return { key: 'fit', label: 'Assessment', value: '—', name: 'Fit', sub: 'Awaiting analysis', tone: 'muted', icon: Target }
  }
  return {
    key: 'fit',
    label: 'Assessment',
    value: FIT_RATING_LABELS[rating],
    name: 'Fit',
    tone: FIT_TONE[rating],
    icon: Target,
    meter: { level: FIT_LEVEL[rating], max: 4 },
  }
}

const OFFER_STATUS_TILE: Partial<Record<ApplicationStatus, { value: string; tone: Tone; sub: string }>> = {
  'offer-received': { value: 'Received', tone: 'accent', sub: 'Evaluate & decide' },
  accepted: { value: 'Accepted', tone: 'good', sub: 'Offer accepted' },
  rejected: { value: 'Declined', tone: 'muted', sub: 'Offer declined' },
  withdrawn: { value: 'Withdrawn', tone: 'muted', sub: 'You withdrew' },
}

const OFFER_PENDING: { value: string; tone: Tone; sub: string } = {
  value: 'Pending',
  tone: 'muted',
  sub: 'Awaiting the offer',
}

/** Offer/decision status tile — the final stage's left-hand glance tile. */
export function offerStatusTile(detail: ApplicationDetail): GlanceTileData {
  const meta = OFFER_STATUS_TILE[detail.status] ?? OFFER_PENDING
  return { key: 'offer-status', label: 'Offer', value: meta.value, name: 'Offer', sub: meta.sub, tone: meta.tone, icon: Handshake }
}

function gapTone(gapCount: number, disqualifying: number): Tone {
  if (gapCount === 0) return 'good'
  if (disqualifying > 0) return 'bad'
  return 'warn'
}

function gapSub(gapCount: number, disqualifying: number): string {
  if (disqualifying > 0) return `${disqualifying} disqualifying`
  if (gapCount > 0) return 'None disqualifying'
  return 'No gaps found'
}

/** The three research-evidence tiles — the application's data-health glance. */
function researchTiles(detail: ApplicationDetail): GlanceTileData[] {
  const research = detail.research
  const verified = research?.verifiedMatches?.length ?? 0
  const partial = research?.partialMatches?.length ?? 0
  const gaps = research?.gaps ?? []
  const disqualifying = gaps.filter(gap => gap.isDisqualifying).length
  const total = verified + partial + gaps.length

  return [
    {
      key: 'verified',
      label: 'Research',
      value: String(verified),
      name: 'Verified matches',
      sub: 'Backed by your evidence',
      tone: verified > 0 ? 'good' : 'muted',
      icon: CheckCircle2,
      share: { value: verified, total },
    },
    {
      key: 'partial',
      label: 'Research',
      value: String(partial),
      name: 'Partial matches',
      sub: 'Adjacent — frame carefully',
      tone: partial > 0 ? 'warn' : 'muted',
      icon: AlertTriangle,
      share: { value: partial, total },
    },
    {
      key: 'gaps',
      label: 'Research',
      value: String(gaps.length),
      name: 'Skills gaps',
      sub: gapSub(gaps.length, disqualifying),
      tone: gapTone(gaps.length, disqualifying),
      icon: XCircle,
      share: { value: gaps.length, total },
    },
  ]
}

const PREP_TILE: Record<StageState['prep_status'], { value: string; tone: Tone; sub: string }> = {
  ready: { value: 'Ready', tone: 'good', sub: 'Prep generated' },
  queued: { value: 'Generating', tone: 'accent', sub: 'Coach is working…' },
  failed: { value: 'Failed', tone: 'bad', sub: 'Retry generation' },
  none: { value: 'Not started', tone: 'muted', sub: 'Generate prep to begin' },
}

/** Lead tile for an interview stage — its prep readiness, grounded in stage state. */
function prepTile(stage: InterviewStage, detail: ApplicationDetail): GlanceTileData {
  const prep = detail.stages?.[stage]?.prep_status ?? 'none'
  const meta = PREP_TILE[prep]
  return {
    key: 'prep',
    label: `Stage ${stageIndex(stage) + 1} of ${STAGE_ORDER.length}`,
    value: meta.value,
    name: `${STAGE_LABELS[stage]} prep`,
    sub: meta.sub,
    tone: meta.tone,
    icon: Sparkles,
  }
}

/**
 * Builds the "at a glance" tiles for the active stage. The Applied stage shows
 * the research data-health glance (verified / partial / gaps + fit); interview
 * stages lead with that stage's prep readiness, then the same research context.
 */
export function stageGlanceTiles(stage: InterviewStage, detail: ApplicationDetail): GlanceTileData[] {
  if (stage === 'applied') {
    return [...researchTiles(detail), fitTile(detail)]
  }
  return [prepTile(stage, detail), ...researchTiles(detail)]
}
