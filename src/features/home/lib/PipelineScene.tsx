"use client"
// src/features/home/lib/PipelineScene.tsx
// Static layered 3D-depth pipeline panel. Fixed camera — NO pointer, NO
// rotate, NO MotionValues. The only hook is useReducedMotion(), used purely
// to pass `reduce` to children (not an interaction). Depth comes from fixed
// per-layer translateZ inside a perspective + preserve-3d container.

import { useReducedMotion } from 'motion/react'
import { BgLayer, CoreLayer } from './pipeline-svg'
import { CardLayer } from './PipelineCards'

export function PipelineScene() {
  const reduce = useReducedMotion() ?? false
  return (
    <div className="relative h-[460px] w-full" style={{ perspective: '1200px' }}>
      <div
        data-scene="stage"
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          data-scene="bg"
          className="pointer-events-none absolute inset-0"
          style={{ transform: 'translateZ(-150px) scale(1.18)' }}
        >
          <BgLayer reduce={reduce} />
        </div>
        <div
          data-scene="core"
          className="pointer-events-none absolute inset-0"
          style={{ transform: 'translateZ(0px)' }}
        >
          <CoreLayer reduce={reduce} />
        </div>
        <div
          data-scene="cards"
          className="absolute inset-0"
          style={{ transform: 'translateZ(120px)' }}
        >
          <CardLayer reduce={reduce} />
        </div>
      </div>
    </div>
  )
}
