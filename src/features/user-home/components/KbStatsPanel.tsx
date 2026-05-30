'use client'

import { motion } from 'motion/react'
import { StatTile } from './StatTile'
import type { HeroTile } from '../lib/hero-tiles'

const GRID = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } } as const
const TILE = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } } as const

export function KbStatsPanel({ tiles }: { readonly tiles: readonly HeroTile[] }) {
  return (
    <motion.div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2"
      variants={GRID}
      initial="hidden"
      animate="show"
    >
      {tiles.map(tile => (
        <motion.div key={tile.key} variants={TILE} style={{ willChange: 'transform' }}>
          <StatTile tile={tile} />
        </motion.div>
      ))}
    </motion.div>
  )
}
