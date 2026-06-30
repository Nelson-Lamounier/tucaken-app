'use client'

import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Bot, Upload, GitBranch, Briefcase } from 'lucide-react'

// Staggered entrance for the grid; springy lift/press per card.
const GRID = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } } as const
const ITEM = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } } as const
const PRESS = { type: 'spring', stiffness: 400, damping: 30 } as const

// Shared card chrome — kept as a const so the four actions don't duplicate the
// (long) class string. Links stay explicit to preserve TanStack router types.
const CARD_CLASS =
  'group flex items-center gap-4 rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-teal-500/40 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/4 dark:hover:border-teal-500/30 dark:hover:bg-white/6'

function ActionBody({
  icon: Icon,
  title,
  sub,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly title: string
  readonly sub: string
}) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center text-teal-600 dark:text-teal-400">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        <span className="block text-xs text-zinc-500">{sub}</span>
      </span>
    </>
  )
}

export function KbQuickActions() {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Quick Actions</h3>
      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        variants={GRID}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        <motion.div variants={ITEM} whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }} transition={PRESS} style={{ willChange: 'transform' }}>
          <Link to="/applications/new" className={CARD_CLASS}>
            <ActionBody icon={Bot} title="Resume Builder" sub="Tailor your resume to a job" />
          </Link>
        </motion.div>

        <motion.div variants={ITEM} whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }} transition={PRESS} style={{ willChange: 'transform' }}>
          <Link to="/settings/github" search={{ tab: 'resumes' }} className={CARD_CLASS}>
            <ActionBody icon={Upload} title="Upload Resume" sub="Add a PDF to your knowledge base" />
          </Link>
        </motion.div>

        <motion.div variants={ITEM} whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }} transition={PRESS} style={{ willChange: 'transform' }}>
          <Link to="/settings/github" search={{ tab: 'repositories' }} className={CARD_CLASS}>
            <ActionBody icon={GitBranch} title="Connect Repo" sub="Index a GitHub repository" />
          </Link>
        </motion.div>

        <motion.div variants={ITEM} whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }} transition={PRESS} style={{ willChange: 'transform' }}>
          <Link to="/applications" className={CARD_CLASS}>
            <ActionBody icon={Briefcase} title="Applications" sub="Track your job pipeline" />
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}
