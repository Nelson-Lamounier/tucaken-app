"use client"
// Reveals a heading word-by-word on scroll into view: each token clips up
// from below with a stagger. Independent transforms only; reduced motion
// renders the text statically (no clip, no offset).
import { motion, useReducedMotion } from 'motion/react'
import { splitTokens } from './kinetic-util'

interface Props {
  text: string
  as?: 'h1' | 'h2' | 'span'
  className?: string
  stagger?: number
}

export function KineticText({ text, as = 'h2', className, stagger = 0.06 }: Props) {
  const reduce = useReducedMotion() ?? false
  const tokens = splitTokens(text)
  const MotionTag = motion[as] as typeof motion.h2

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ staggerChildren: reduce ? 0 : stagger }}
    >
      {tokens.map((token, i) => (
        <span key={`${token}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            style={{ willChange: 'transform, opacity' }}
            variants={{
              hidden: { y: reduce ? 0 : '100%', opacity: reduce ? 1 : 0 },
              show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 120, damping: 18 } },
            }}
          >
            {token}
          </motion.span>
          {i < tokens.length - 1 ? ' ' : null}
        </span>
      ))}
    </MotionTag>
  )
}
