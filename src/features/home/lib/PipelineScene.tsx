"use client"
// src/features/home/lib/PipelineScene.tsx
// Static layered 3D-depth pipeline panel. Fixed camera — NO pointer, NO
// rotate, NO MotionValues. The only hook is useReducedMotion(), used purely
// to pass `reduce` to children (not an interaction).
//
// Depth for the SVG layers comes from fixed translateZ inside a
// perspective + preserve-3d container. CardLayer is deliberately a SIBLING
// of (not inside) the preserve-3d stage and layered in front via z-index:
// Chrome/Edge do not render backdrop-filter (the cards' glassmorphism blur)
// inside a preserve-3d ancestor (crbug 323735424).

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
      </div>
      <div data-scene="cards" className="absolute inset-0 z-10">
        <CardLayer reduce={reduce} />
      </div>
    </div>
  )
}
