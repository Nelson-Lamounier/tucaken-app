"use client"
// Fixed scroll-progress bar. scaleX is driven by a MotionValue (scrollYProgress
// smoothed by a spring) and bound via style — never read during render.
import { motion, useScroll, useSpring } from 'motion/react'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-teal-400 to-emerald-500"
      style={{ scaleX, willChange: 'transform' }}
    />
  )
}
