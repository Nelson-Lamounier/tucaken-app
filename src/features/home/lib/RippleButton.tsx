"use client"
// src/features/home/lib/RippleButton.tsx
// Standard hero CTA: Material-Design ripple (Motion+ example) adapted to brand tokens.
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

interface Ripple {
  id: number
  x: number
  y: number
  size: number
}

interface Props {
  children: ReactNode
  onClick?: () => void
  className?: string
}

function rippleFrom(button: HTMLButtonElement, originX: number, originY: number, id: number): Ripple {
  const rect = button.getBoundingClientRect()
  const localX = originX - rect.left
  const localY = originY - rect.top
  const dx = Math.max(localX, rect.width - localX)
  const dy = Math.max(localY, rect.height - localY)
  const radius = Math.sqrt(dx * dx + dy * dy)
  return { id, x: localX, y: localY, size: radius * 2 }
}

export function RippleButton({ children, onClick, className = '' }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const idRef = useRef(0)
  const [ripples, setRipples] = useState<Ripple[]>([])

  const addRipple = useCallback((originX: number, originY: number) => {
    const button = buttonRef.current
    if (!button) return
    const next = rippleFrom(button, originX, originY, ++idRef.current)
    setRipples((prev) => [...prev, next])
  }, [])

  const removeLastRipple = useCallback(() => {
    setRipples((prev) => (prev.length ? prev.slice(0, -1) : prev))
  }, [])

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.isPrimary) addRipple(event.clientX, event.clientY)
    },
    [addRipple],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      addRipple(rect.left + rect.width / 2, rect.top + rect.height / 2)
    },
    [addRipple],
  )

  const onKeyUp = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === ' ' || event.key === 'Enter') removeLastRipple()
    },
    [removeLastRipple],
  )

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={removeLastRipple}
      onPointerCancel={removeLastRipple}
      onPointerLeave={removeLastRipple}
      onBlur={removeLastRipple}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      initial={{ borderColor: '#8df0ccaa', backgroundColor: '#8df0cc08' }}
      whileHover={{ borderColor: '#8df0cc', backgroundColor: '#8df0cc30' }}
      transition={{ duration: 0.2, ease: 'linear' }}
      style={{ willChange: 'background-color' }}
      className={[
        'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-md border px-6 py-3',
        'text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400',
        className,
      ].join(' ')}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      <span className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-md" aria-hidden>
        <AnimatePresence>
          {ripples.map((ripple) => (
            <motion.span
              key={ripple.id}
              className="absolute rounded-full bg-teal-200"
              style={{
                width: ripple.size,
                height: ripple.size,
                left: ripple.x - ripple.size / 2,
                top: ripple.y - ripple.size / 2,
                willChange: 'transform, opacity',
              }}
              initial={{ opacity: 0, transform: 'scale(0)' }}
              animate={{ opacity: 0.4, transform: 'scale(1)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
            />
          ))}
        </AnimatePresence>
      </span>
    </motion.button>
  )
}
