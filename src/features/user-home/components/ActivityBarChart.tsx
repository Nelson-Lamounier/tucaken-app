'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { BarStack } from '@visx/shape'
import { Group } from '@visx/group'
import { GridRows } from '@visx/grid'
import { AxisBottom } from '@visx/axis'
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale'
import { useTooltip, useTooltipInPortal } from '@visx/tooltip'
import type { DailyActivity } from '@/lib/types/rag.types'

/**
 * Stacked daily-activity bar chart (applications + resumes per day) built on
 * visx. Series colours come from CSS-var fills (--accent teal / --chart-series-2
 * amber) so they flip for dark mode; axis + grid use currentColor so they follow
 * the wrapper's text colour. Width is supplied by a ParentSize wrapper.
 */

// A plain (mutable) row — visx scales expect non-readonly accessors.
type Row = { date: string; applications: number; resumes: number }
const KEYS = ['applications', 'resumes'] as const
type ActivityKey = (typeof KEYS)[number]

const SERIES_COLOURS: Record<ActivityKey, string> = {
  applications: 'var(--accent)',
  resumes: 'var(--chart-series-2)',
}

const MARGIN = { top: 8, right: 4, bottom: 22, left: 4 }
const MAX_X_TICKS = 6

const getDate = (d: Row) => d.date

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function xTickValues(dates: readonly string[]): string[] {
  const step = Math.max(1, Math.ceil(dates.length / MAX_X_TICKS))
  const out: string[] = []
  for (let i = 0; i < dates.length; i += step) out.push(dates[i])
  return out
}

interface ActivityBarChartProps {
  readonly data: readonly DailyActivity[]
  readonly width: number
  readonly height: number
}

export function ActivityBarChart({ data, width, height }: ActivityBarChartProps) {
  const { tooltipOpen, tooltipLeft, tooltipTop, tooltipData, showTooltip, hideTooltip } = useTooltip<Row>()
  const { containerRef, TooltipInPortal } = useTooltipInPortal({ detectBounds: true, scroll: true })
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  if (width < 10) return null

  const rows: Row[] = data.map(d => ({ date: d.date, applications: d.applications, resumes: d.resumes }))
  const dates = rows.map(getDate)
  const maxTotal = rows.reduce((m, r) => Math.max(m, r.applications + r.resumes), 0)

  const xMax = width - MARGIN.left - MARGIN.right
  const yMax = height - MARGIN.top - MARGIN.bottom

  const dateScale = scaleBand<string>({ domain: dates, range: [0, xMax], padding: 0.25 })
  const valueScale = scaleLinear<number>({ domain: [0, maxTotal || 1], range: [yMax, 0], nice: true })
  const keys: ActivityKey[] = [...KEYS]
  const colourScale = scaleOrdinal<ActivityKey, string>({ domain: keys, range: keys.map(k => SERIES_COLOURS[k]) })

  return (
    <div className="relative text-zinc-400 dark:text-zinc-500">
      <svg ref={containerRef} width={width} height={height}>
        <Group top={MARGIN.top} left={MARGIN.left}>
          <GridRows scale={valueScale} width={xMax} height={yMax} numTicks={3} stroke="currentColor" strokeOpacity={0.18} strokeDasharray="2,3" />
          <BarStack<Row, ActivityKey> data={rows} keys={keys} x={getDate} xScale={dateScale} yScale={valueScale} color={colourScale}>
            {barStacks =>
              barStacks.map(barStack =>
                barStack.bars.map(bar => {
                  const date = bar.bar.data.date
                  const dimmed = hoveredDate !== null && hoveredDate !== date
                  return (
                    <motion.rect
                      key={`${barStack.key}-${date}`}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      fill={bar.color}
                      rx={1}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center bottom', willChange: 'transform, opacity' }}
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: dimmed ? 0.3 : 1 }}
                      transition={{ scaleY: { duration: 0.5, delay: bar.index * 0.015, ease: 'easeOut' }, opacity: { duration: 0.2 } }}
                      pointerEvents="none"
                    />
                  )
                }),
              )
            }
          </BarStack>

          {/* Full-height hover hit-area per day — captures hover anywhere in the
              column (including zero-activity days) and drives the tooltip. */}
          {rows.map(r => {
            const bandX = dateScale(r.date) ?? 0
            const total = r.applications + r.resumes
            return (
              <rect
                key={`hit-${r.date}`}
                x={bandX}
                y={0}
                width={dateScale.bandwidth()}
                height={yMax}
                fill="transparent"
                onMouseLeave={() => {
                  setHoveredDate(null)
                  hideTooltip()
                }}
                onMouseMove={() => {
                  setHoveredDate(r.date)
                  showTooltip({
                    tooltipData: r,
                    tooltipTop: valueScale(total) + MARGIN.top,
                    tooltipLeft: bandX + dateScale.bandwidth() / 2 + MARGIN.left,
                  })
                }}
              />
            )
          })}
        </Group>
        <AxisBottom
          top={yMax + MARGIN.top}
          left={MARGIN.left}
          scale={dateScale}
          tickValues={xTickValues(dates)}
          tickFormat={formatDay}
          stroke="currentColor"
          strokeWidth={1}
          tickStroke="currentColor"
          hideAxisLine={false}
          tickLabelProps={() => ({ fill: 'currentColor', fontSize: 10, textAnchor: 'middle', dy: '0.25em' })}
        />
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipInPortal
          key={`${tooltipData.date}-${tooltipLeft}`}
          top={tooltipTop}
          left={tooltipLeft}
          style={{ position: 'absolute', background: 'none', border: 'none', boxShadow: 'none', padding: 0, pointerEvents: 'none' }}
        >
          <div className="min-w-36 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-white/10 dark:bg-zinc-900">
            <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{formatDay(tooltipData.date)}</p>
            <p className="flex items-center justify-between gap-3 text-zinc-600 dark:text-zinc-300">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-accent" aria-hidden />
                Applications
              </span>
              <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{tooltipData.applications}</span>
            </p>
            <p className="mt-0.5 flex items-center justify-between gap-3 text-zinc-600 dark:text-zinc-300">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-(--chart-series-2)" aria-hidden />
                Resumes
              </span>
              <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{tooltipData.resumes}</span>
            </p>
            <p className="mt-1.5 flex items-center justify-between gap-3 border-t border-zinc-100 pt-1.5 text-zinc-500 dark:border-white/5 dark:text-zinc-400">
              <span>Total</span>
              <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{tooltipData.applications + tooltipData.resumes}</span>
            </p>
          </div>
        </TooltipInPortal>
      )}
    </div>
  )
}
