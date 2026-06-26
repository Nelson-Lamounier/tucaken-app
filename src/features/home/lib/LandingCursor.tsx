"use client"
// src/features/home/lib/LandingCursor.tsx
// Motion+ magnetic cursor for the marketing landing page. A small dot follows the
// pointer; a rotating reticule snaps to interactive targets (links, buttons, CTA).
// Mounted only on the home route, so the native cursor is restored everywhere else.
import { Cursor, useCursorState } from 'motion-plus/react'
import { animate, motion, useMotionValue } from 'motion/react'
import { useEffect } from 'react'

interface CornerProps {
  thickness?: number
  length?: number
  top?: number
  right?: number
  bottom?: number
  left?: number
}

function Corner({ thickness = 2, length = 10, ...position }: CornerProps) {
  return (
    <>
      <motion.div layout className="absolute bg-teal-300" style={{ width: thickness, height: length, ...position }} />
      <motion.div layout className="absolute bg-teal-300" style={{ width: length, height: thickness, ...position }} />
    </>
  )
}

export function LandingCursor() {
  const state = useCursorState()
  const rotate = useMotionValue(0)

  useEffect(() => {
    if (!state.targetBoundingBox) {
      // No target: idle infinite spin.
      animate(rotate, [rotate.get(), rotate.get() + 360], { duration: 3, ease: 'linear', repeat: Infinity })
    } else {
      // Snapped to a target: settle to the nearest 180-degree angle.
      animate(rotate, Math.round(rotate.get() / 180) * 180, { type: 'spring', bounce: 0.3 })
    }
  }, [state.targetBoundingBox, rotate])

  return (
    <>
      <Cursor
        magnetic={{ morph: false, snap: 0 }}
        style={{ width: 6, height: 6, backgroundColor: '#5eead4', borderRadius: 9999 }}
      />
      <Cursor
        magnetic={{ snap: 0.9 }}
        style={{ rotate, width: 40, height: 40, backgroundColor: 'transparent', borderRadius: 0 }}
        variants={{ pressed: { scale: state.targetBoundingBox ? 0.9 : 0.7 } }}
      >
        <Corner top={0} left={0} />
        <Corner top={0} right={0} />
        <Corner bottom={0} left={0} />
        <Corner bottom={0} right={0} />
      </Cursor>
    </>
  )
}
