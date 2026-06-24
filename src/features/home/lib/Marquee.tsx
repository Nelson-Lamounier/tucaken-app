'use client'
// Horizontal infinite-scroll band. Compositor-only (translateX via the
// `belt-scroll` keyframe). The track is duplicated so -50% loops seamlessly;
// the second copy is aria-hidden. Frozen by the reduced-motion kill-switch.
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  speed?: number
  reverse?: boolean
  className?: string
}

export function Marquee({ children, speed = 32, reverse = false, className }: Props) {
  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      <div
        className="marquee-anim flex w-max"
        data-reverse={reverse ? 'true' : undefined}
        style={{ '--marquee-duration': `${speed}s`, willChange: 'transform' } as React.CSSProperties}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">{children}</div>
      </div>
    </div>
  )
}
