"use client"
// src/features/home/lib/MeshBg.tsx
import { motion } from 'motion/react'

export function MeshBg({ intense = false }: { intense?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(50% 40% at 20% 20%, oklch(0.65 0.14 175 / 0.45), transparent 60%), radial-gradient(45% 35% at 80% 30%, oklch(0.62 0.16 155 / 0.4), transparent 60%), radial-gradient(60% 50% at 50% 100%, oklch(0.5 0.13 200 / 0.4), transparent 60%)',
        }}
        animate={intense ? { filter: ['hue-rotate(0deg)', 'hue-rotate(15deg)', 'hue-rotate(0deg)'] } : undefined}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
    </div>
  )
}
