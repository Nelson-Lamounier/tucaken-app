'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { RotateCw, CheckCircle2, CircleDashed, CircleSlash } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TONE, type Tone } from '@/components/ui/tone'
import { Card } from '@/components/ui/Card'
import type { EvidenceStrength } from '../types/workspace'

const FLIP_SPRING = { type: 'spring', visualDuration: 0.45, bounce: 0.18 } as const
const FACE = 'absolute inset-0 flex flex-col rounded-md border p-4 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]'

const STRENGTH_TONE: Record<EvidenceStrength, Tone> = { strong: 'good', moderate: 'warn', none: 'bad' }
const STRENGTH_BORDER: Record<EvidenceStrength, string> = {
  strong:   'border-emerald-200 dark:border-emerald-500/30',
  moderate: 'border-amber-200 dark:border-amber-500/30',
  none:     'border-red-200 dark:border-red-500/30',
}
const STRENGTH_ICON: Record<EvidenceStrength, LucideIcon> = { strong: CheckCircle2, moderate: CircleDashed, none: CircleSlash }
const STRENGTH_LABEL: Record<EvidenceStrength, string> = { strong: 'Strong evidence', moderate: 'Some evidence', none: 'Gap' }

/** One card in a deck. `back` is any node (text, chips, links). */
export interface EvidenceCard {
  readonly id: string
  readonly title: string
  readonly strength: EvidenceStrength
  readonly backLabel: string
  readonly hint: string
  readonly back: ReactNode
}

function EvidenceFlipCard({ card }: { readonly card: EvidenceCard }) {
  const reduce = useReducedMotion()
  const [flipped, setFlipped] = useState(false)
  const tone = STRENGTH_TONE[card.strength]
  const border = STRENGTH_BORDER[card.strength]
  const Icon = STRENGTH_ICON[card.strength]

  return (
    <button
      type="button"
      onClick={() => setFlipped(prev => !prev)}
      aria-pressed={flipped}
      className="h-44 w-full rounded-md text-left perspective-distant focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : FLIP_SPRING}
      >
        <div className={`${FACE} bg-white dark:bg-white/2 ${border}`}>
          <div className="flex items-center justify-between">
            <Icon className={`size-5 ${TONE[tone].dot}`} role="img" aria-label={STRENGTH_LABEL[card.strength]} />
            <RotateCw className="size-3.5 text-zinc-300 dark:text-zinc-600" aria-hidden />
          </div>
          <p className="mt-3 flex-1 text-base font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-100">{card.title}</p>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{card.hint}</span>
        </div>

        <div className={`${FACE} transform-[rotateY(180deg)] bg-zinc-50 dark:bg-white/5 ${border}`}>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase ${TONE[tone].text}`}>
            <Icon className="size-3.5" aria-hidden />
            {card.backLabel}
          </span>
          <div className="mt-1.5 flex-1 space-y-1.5 overflow-y-auto text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
            {card.back}
          </div>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
            <RotateCw className="size-3" aria-hidden /> Flip back
          </span>
        </div>
      </motion.div>
    </button>
  )
}

/** A titled deck of evidence flip cards — one shared representation across stages. */
export function EvidenceDeck({
  title,
  subtitle,
  cards,
  emptyState,
}: {
  readonly title: string
  readonly subtitle: string
  readonly cards: readonly EvidenceCard[]
  readonly emptyState?: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </div>
      {cards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => (
            <EvidenceFlipCard key={card.id} card={card} />
          ))}
        </div>
      ) : (
        emptyState ?? <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No evidence yet.</Card>
      )}
    </section>
  )
}
