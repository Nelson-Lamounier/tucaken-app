'use client'

import { Card } from '@/components/ui/Card'
import { Sparkline } from '@/components/ui/Sparkline'
import { TONE } from '@/components/ui/tone'
import { formatRelativeTime } from '../lib/activity'
import type { HeroTile } from '../lib/hero-tiles'

/** A single KPI tile. Icon + last-updated label top-left, the value as the hero
 *  metric with name and sub, then a full-width growth sparkline at the bottom. */
export function StatTile({ tile }: { readonly tile: HeroTile }) {
  const Icon = tile.icon
  // Numeric values read as the big hero metric; status words (Ready) stay large.
  const isNumeric = !Number.isNaN(Number(tile.value))
  const valueSize = isNumeric ? 'text-4xl' : 'text-3xl'
  const updated = tile.updatedAt === null ? null : formatRelativeTime(tile.updatedAt, Date.now())

  let topLabel: string
  if (tile.isStatus) topLabel = 'Status'
  else if (updated)  topLabel = `Updated ${updated}`
  else               topLabel = 'Not yet updated'

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-white/5 ${TONE[tile.tone].dot}`}>
          <Icon className="size-4" />
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          {topLabel}
        </span>
      </div>

      <p className={`font-semibold leading-none tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100 ${valueSize}`}>
        {tile.value}
      </p>

      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{tile.name}</p>
        {tile.sub && <p className={`mt-0.5 text-[11px] font-medium ${TONE[tile.tone].text}`}>{tile.sub}</p>}
      </div>

      {tile.spark && <Sparkline points={tile.spark} className="mt-auto h-8 w-full" />}
    </Card>
  )
}
