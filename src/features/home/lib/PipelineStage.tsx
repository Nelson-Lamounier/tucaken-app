"use client"
// src/features/home/lib/PipelineStage.tsx
// 2.5D parallax stage: one spring-tilted preserve-3d camera. Children
// render into the top (interactive) copy layer.

import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { BgLayer, CoreLayer } from './pipeline-svg'
import { CardLayer } from './PipelineCards'

const SPRING = { stiffness: 80, damping: 20 }

export function PipelineStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion() ?? false

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), SPRING)
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), SPRING)

  useEffect(() => {
    if (reduce) return
    const el = ref.current
    if (!el) return
    const handle = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      mx.set((e.clientX - r.left) / r.width - 0.5)
      my.set((e.clientY - r.top) / r.height - 0.5)
    }
    el.addEventListener('mousemove', handle)
    return () => el.removeEventListener('mousemove', handle)
  }, [reduce, mx, my])

  return (
    <div ref={ref} className="relative h-[460px] w-full" style={{ perspective: '1200px' }}>
      <motion.div
        className="absolute inset-0"
        style={{
          transformStyle: 'preserve-3d',
          rotateX: reduce ? 0 : rotateX,
          rotateY: reduce ? 0 : rotateY,
          willChange: 'transform',
        }}
      >
        <div data-layer="bg" className="pointer-events-none absolute inset-0" style={{ transform: 'translateZ(-150px) scale(1.18)' }}>
          <BgLayer reduce={reduce} />
        </div>
        <div data-layer="core" className="pointer-events-none absolute inset-0" style={{ transform: 'translateZ(0px)' }}>
          <CoreLayer reduce={reduce} />
        </div>
        <div data-layer="cards" className="pointer-events-none absolute inset-0" style={{ transform: 'translateZ(150px)' }}>
          <CardLayer reduce={reduce} />
        </div>
        <div data-layer="copy" className="pointer-events-auto absolute inset-0" style={{ transform: 'translateZ(220px)' }}>
          {children}
        </div>
      </motion.div>
    </div>
  )
}
