"use client"
// src/components/LoadingOverlay.tsx
// First-access intro: a thin vertical line grows from the centre, then opens
// like a curtain to reveal the page beneath. clipPath line-reveal (Motion for
// React). Plays once per session; respects prefers-reduced-motion; removes
// itself from the DOM once finished so it never blocks interaction.
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type Transition,
} from 'motion/react'
import { useEffect, useState } from 'react'

const SESSION_KEY = 'tucaken-intro-seen'

function introAlreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function LoadingOverlay() {
  const progress = useSpring(0, { stiffness: 500, damping: 40 })
  const [isLoaded, setIsLoaded] = useState(false)
  const [hidden, setHidden] = useState(false)

  // Edges of the clip-path slit: starts as a 4px line at the centre.
  const leftEdge = useMotionValue('calc(50% - 2px)')
  const rightEdge = useMotionValue('calc(50% + 2px)')
  const topEdge = useTransform(progress, [0, 1], ['50%', '0%'])
  const bottomEdge = useTransform(progress, [0, 1], ['50%', '100%'])

  // Teal covers everything except a thin vertical slit punched out of the middle;
  // the slit grows tall as progress fills, then opens wide once loaded.
  const clipPath = useMotionTemplate`polygon(0% 0%, ${leftEdge} 0%, ${leftEdge} ${topEdge}, ${leftEdge} ${bottomEdge}, ${rightEdge} ${bottomEdge}, ${rightEdge} ${topEdge}, ${leftEdge} ${topEdge}, ${leftEdge} 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%)`

  // Drive the intro on mount. Skip (remove immediately) on repeat visits or for
  // reduced-motion users.
  useEffect(() => {
    if (introAlreadySeen() || prefersReducedMotion()) {
      setHidden(true)
      return
    }
    progress.set(1)
  }, [progress])

  useMotionValueEvent(progress, 'change', (latest) => {
    if (latest >= 0.99 && !isLoaded) setIsLoaded(true)
  })

  // Loaded: open the slit into a full-width curtain, then unmount.
  useEffect(() => {
    if (!isLoaded) return
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // sessionStorage unavailable (private mode) — the intro just replays next load.
    }
    const transition: Transition = { type: 'spring', visualDuration: 0.5, bounce: 0 }
    const left = animate(leftEdge, 'calc(0% - 0px)', transition)
    const right = animate(rightEdge, 'calc(100% + 0px)', transition)
    void Promise.all([left.finished, right.finished]).then(() => setHidden(true))
  }, [isLoaded, leftEdge, rightEdge])

  if (hidden) return null

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9998] bg-zinc-950"
        animate={{ opacity: isLoaded ? 0 : 1 }}
        transition={{ duration: 0.4 }}
        style={{ willChange: 'opacity' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9999] bg-teal-500"
        style={{ clipPath, willChange: 'clip-path' }}
      />
    </>
  )
}
