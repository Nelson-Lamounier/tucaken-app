import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TONE } from './tone'
import type { Tone } from './tone'

interface ChipProps {
  readonly label: ReactNode
  readonly tone?: Tone
  readonly className?: string
}

/** Pill badge. Ported from the TailwindPlus "Pill with border" badge, driven by
 *  the semantic TONE table so it stays dual-mode. */
export function Chip({ label, tone = 'muted', className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium inset-ring',
        TONE[tone].chip,
        className,
      )}
    >
      {label}
    </span>
  )
}
