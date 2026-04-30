// src/features/home/lib/MagneticButton.tsx
import { motion } from 'motion/react'
import { useRef, useState, type ReactNode, type MouseEvent } from 'react'

interface Props {
  children: ReactNode
  primary?: boolean
  onClick?: () => void
  className?: string
}

export function MagneticButton({ children, primary, onClick, className = '' }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const handleMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = e.clientX - (r.left + r.width / 2)
    const y = e.clientY - (r.top + r.height / 2)
    setPos({ x: x * 0.25, y: y * 0.25 })
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      onMouseMove={handleMove}
      onMouseLeave={() => setPos({ x: 0, y: 0 })}
      onClick={onClick}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, mass: 0.4 }}
      className={[
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-3 text-sm font-semibold transition-shadow',
        primary
          ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40'
          : 'border border-white/15 bg-white/5 text-white backdrop-blur hover:bg-white/10',
        className,
      ].join(' ')}
    >
      {primary && (
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  )
}
