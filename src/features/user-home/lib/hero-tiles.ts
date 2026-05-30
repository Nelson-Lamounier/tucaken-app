import { GitBranch, Layers, FileText, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tone } from '@/components/ui/tone'
import type { ConnectedRepo } from '@/lib/types/github.types'
import type { CareerEntry, ResumeImportRecord } from '@/server/resume-imports'
import type { KbStats } from './kb-stats'

export interface HeroTile {
  readonly key: string
  readonly name: string
  readonly value: string
  readonly sub: string
  readonly tone: Tone
  readonly icon: LucideIcon
  /** rising mini-series for the sparkline, or null for a status tile */
  readonly spark: number[] | null
  /** epoch ms this metric last changed, or null if never */
  readonly updatedAt: number | null
  /** status tile (e.g. Knowledge Base): shows a "Status" label, no sparkline */
  readonly isStatus: boolean
}

export interface HeroSparks {
  /** per-item increments; each tile's growth line is the running total of these */
  readonly repoIncrements: number[]
  readonly careerIncrements: number[]
  readonly uploadIncrements: number[]
}

export interface HeroMeta {
  readonly repos: number | null
  readonly career: number | null
  readonly uploads: number | null
  readonly kb: number | null
}

const ENTRY_ORDER = ['experience', 'education', 'skill', 'project', 'certification', 'achievement'] as const

/** Build per-tile growth increments from data already loaded — no mock trends.
 *  Each tile's sparkline is the running total of its increments (see growthSpark). */
export function deriveHeroSparks(
  repos: readonly ConnectedRepo[],
  entries: readonly CareerEntry[],
  imports: readonly ResumeImportRecord[],
): HeroSparks {
  return {
    // one step per connected repo → line climbs as repos are added
    repoIncrements: repos.map(() => 1),
    // entries added per category → climbs with career depth
    careerIncrements: ENTRY_ORDER.map(type => entries.filter(e => e.entryType === type).length),
    // entries extracted per résumé import
    uploadIncrements: imports.map(i => i.careerEntriesCreated.length),
  }
}

/** Latest parseable timestamp in a list of ISO strings, or null. */
function latestTs(values: ReadonlyArray<string | undefined | null>): number | null {
  let max: number | null = null
  for (const v of values) {
    if (!v) continue
    const t = Date.parse(v)
    if (Number.isNaN(t)) continue
    if (max === null || t > max) max = t
  }
  return max
}

/** When each tile's metric last changed, from real timestamps on hand. */
export function deriveHeroMeta(
  repos: readonly ConnectedRepo[],
  entries: readonly CareerEntry[],
  imports: readonly ResumeImportRecord[],
): HeroMeta {
  const reposTs = latestTs(repos.map(r => r.lastSyncedAt))
  const careerTs = latestTs(entries.map(e => e.createdAt))
  const uploadsTs = latestTs(imports.map(i => i.createdAt))
  const present = [reposTs, careerTs, uploadsTs].filter((n): n is number => n !== null)
  const kb = present.length > 0 ? Math.max(...present) : null
  return { repos: reposTs, career: careerTs, uploads: uploadsTs, kb }
}

/** Turn per-item increments into a rising growth line: a baseline 0 then the
 *  running total, so it climbs left→right (newest/highest on the right). Returns
 *  null only when there's nothing to chart. */
function growthSpark(increments: number[]): number[] | null {
  if (increments.length === 0) return null
  const series = [0]
  let total = 0
  for (const v of increments) {
    total += v
    series.push(total)
  }
  return series
}

const TILE_META = [
  { key: 'repos', name: 'Connected Repositories', icon: GitBranch },
  { key: 'career', name: 'Career Entries', icon: Layers },
  { key: 'uploads', name: 'Resume Uploads', icon: FileText },
  { key: 'kb', name: 'Knowledge Base', icon: Sparkles },
] as const

function loadingTiles(): HeroTile[] {
  return TILE_META.map(meta => ({
    ...meta,
    value: '…',
    sub: '',
    tone: 'muted',
    spark: null,
    updatedAt: null,
    isStatus: meta.key === 'kb',
  }))
}

export function buildHeroTiles(
  isLoading: boolean,
  stats: KbStats,
  sparks: HeroSparks,
  meta: HeroMeta,
): HeroTile[] {
  if (isLoading) return loadingTiles()

  const uploadsTone: Tone = stats.failedImportCount > 0 ? 'warn' : 'good'
  const kbTone: Tone = stats.isReady ? 'good' : 'warn'
  const kbValue = stats.isReady ? 'Ready' : 'Needs setup'
  const kbSub = stats.isReady ? 'AI agent has data to work with' : 'Upload a resume or connect a repo'

  return [
    {
      ...TILE_META[0],
      value: String(stats.repoCount),
      sub: `${stats.syncedRepoCount} synced · ${stats.pendingRepoCount} pending`,
      tone: 'good',
      spark: growthSpark(sparks.repoIncrements),
      updatedAt: meta.repos,
      isStatus: false,
    },
    {
      ...TILE_META[1],
      value: String(stats.careerEntryCount),
      sub: `${stats.experienceCount} exp · ${stats.educationCount} edu · ${stats.skillCount} skills`,
      tone: 'good',
      spark: growthSpark(sparks.careerIncrements),
      updatedAt: meta.career,
      isStatus: false,
    },
    {
      ...TILE_META[2],
      value: String(stats.importCount),
      sub: `${stats.processedImportCount} processed · ${stats.failedImportCount} failed`,
      tone: uploadsTone,
      spark: growthSpark(sparks.uploadIncrements),
      updatedAt: meta.uploads,
      isStatus: false,
    },
    {
      ...TILE_META[3],
      value: kbValue,
      sub: kbSub,
      tone: kbTone,
      spark: null,
      updatedAt: meta.kb,
      isStatus: true,
    },
  ]
}
