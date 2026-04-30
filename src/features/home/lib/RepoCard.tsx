// src/features/home/lib/RepoCard.tsx
import { motion } from 'motion/react'
import { useState, type MouseEvent } from 'react'

export interface Repo {
  name: string
  desc: string
  meta: string
  lang: string
  color: string
}

export function RepoCard({ r, tilt = false }: { r: Repo; tilt?: boolean }) {
  const [t, setT] = useState({ rx: 0, ry: 0 })

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!tilt) return
    const b = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - b.left) / b.width - 0.5
    const y = (e.clientY - b.top) / b.height - 0.5
    setT({ rx: -y * 8, ry: x * 8 })
  }

  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={() => setT({ rx: 0, ry: 0 })}
      animate={{ rotateX: t.rx, rotateY: t.ry }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      style={{ transformStyle: 'preserve-3d' }}
      className="rounded-xl border border-white/10 bg-zinc-900/70 p-3 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
        <span className="font-mono text-[11px] text-zinc-300">{r.name}</span>
      </div>
      <div className="mt-1 text-[11px] text-zinc-400">{r.desc}</div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{r.meta}</span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300">{r.lang}</span>
      </div>
    </motion.div>
  )
}
