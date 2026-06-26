import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  /** render as a different element (e.g. 'li', 'section') — defaults to div */
  readonly as?: ElementType
  readonly className?: string
  readonly children: ReactNode
}

/** Surface primitive for the KB dashboard. Ported from the TailwindPlus
 *  "Basic card" pattern, re-tokenized to zinc + dual-mode: a white, hairline
 *  ring-bordered card in light mode; a faint white-on-zinc panel in dark. */
export function Card({ as, className, children }: CardProps) {
  const Tag = as ?? 'div'
  return (
    <Tag
      className={cn(
        'rounded-md bg-white ring-1 ring-zinc-200 shadow-sm',
        'dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
