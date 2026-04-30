// src/features/home/lib/Pipeline.tsx
import { motion } from 'motion/react'
import { Fragment } from 'react'

const NODES = [
  { label: 'GitHub', sub: 'reads repos', icon: '⌥' },
  { label: 'Tucaken AI', sub: 'grounds claims', icon: '◆', active: true },
  { label: 'Resume', sub: 'verifiable', icon: '⎘' },
] as const

export function Pipeline() {
  return (
    <div className="relative grid grid-cols-3 items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 backdrop-blur-md">
      {NODES.map((n, i) => (
        <Fragment key={n.label}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className={[
              'rounded-xl border p-3 text-center',
              'active' in n && n.active ? 'border-teal-500/40 bg-teal-500/10' : 'border-white/10 bg-white/[0.02]',
            ].join(' ')}
          >
            <div
              className={[
                'mx-auto mb-1 grid h-9 w-9 place-items-center rounded-lg text-base',
                'active' in n && n.active ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white' : 'bg-white/5 text-zinc-300',
              ].join(' ')}
            >
              {n.icon}
            </div>
            <div className="text-xs font-semibold text-white">{n.label}</div>
            <div className="text-[10px] text-zinc-500">{n.sub}</div>
          </motion.div>
        </Fragment>
      ))}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute top-1/2 h-px bg-gradient-to-r from-teal-500/0 via-teal-400/80 to-teal-500/0"
          style={{ left: `${33.33 * (i + 1) - 8}%`, width: '16%' }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
        />
      ))}
    </div>
  )
}
