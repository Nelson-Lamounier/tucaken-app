// src/features/home/lib/Section.tsx
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export function Section({ children, id, className = '' }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6 }}
      className={['relative px-6 py-20 md:px-12', className].join(' ')}
    >
      {children}
    </motion.section>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{children}</div>
}
