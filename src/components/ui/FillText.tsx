// src/components/ui/FillText.tsx
//
// Equivalent of Motion+'s "Fill text" loading effect, built on plain
// motion/react (motion-plus is a paid pkg and not installed). A dim base
// label sits under a bright copy that is revealed left→right by an
// animated clip-path, looping while content is loading.
//
// Honours prefers-reduced-motion: renders the solid bright label, no loop.

import { motion, useReducedMotion } from 'motion/react'

interface FillTextProps {
  /** The label to render and fill-animate. */
  text: string
  /** Element to render as. Default 'span'. */
  as?: 'span' | 'p' | 'h3'
  className?: string
  /** Tailwind colour class for the unfilled base text. */
  baseClassName?: string
  /** Tailwind colour class for the filled (sweeping) text. */
  fillClassName?: string
  /** Seconds for one fill sweep. Default 1.6. */
  duration?: number
}

export function FillText({
  text,
  as = 'span',
  className,
  baseClassName = 'text-zinc-600',
  fillClassName = 'text-indigo-300',
  duration = 1.6,
}: Readonly<FillTextProps>) {
  const reduce = useReducedMotion()
  const Tag = motion[as]

  // Reduced motion: solid filled label, no sweep.
  if (reduce) {
    return (
      <Tag className={className} aria-label={text}>
        <span className={fillClassName}>{text}</span>
      </Tag>
    )
  }

  // The base copy reserves layout; the fill copy is overlaid and revealed
  // by sweeping clip-path inset from fully-clipped to fully-open, looping.
  return (
    <Tag className={`relative inline-block ${className ?? ''}`} aria-label={text}>
      <span aria-hidden className={baseClassName}>
        {text}
      </span>
      <motion.span
        aria-hidden
        className={`absolute inset-0 ${fillClassName}`}
        style={{ willChange: 'clip-path' }}
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] }}
        transition={{
          duration,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'loop',
          repeatDelay: 0.15,
        }}
      >
        {text}
      </motion.span>
    </Tag>
  )
}
