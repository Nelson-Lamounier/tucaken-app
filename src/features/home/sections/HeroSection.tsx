// src/features/home/sections/HeroSection.tsx
"use client"
import { motion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { MeshBg } from '../lib/MeshBg'
import { Marquee } from '../lib/Marquee'
import { KineticText } from '../lib/KineticText'
import { RepoCard } from '../lib/RepoCard'
import { repeatForLoop } from '../lib/marquee-util'
import { hero, repos } from '../content'

function RepoBand({ reverse, speed }: { reverse?: boolean; speed: number }) {
  return (
    <Marquee reverse={reverse} speed={speed} className="mask-[linear-gradient(to_right,transparent,white_12%,white_88%,transparent)]">
      {repeatForLoop([...repos]).map((r, i) => (
        <div key={`${r.name}-${i}`} className="mx-3 w-64 shrink-0">
          <RepoCard r={r} />
        </div>
      ))}
    </Marquee>
  )
}

export function HeroSection() {
  const navigate = useNavigate()

  return (
    <div className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
      <MeshBg intense />

      <div className="relative mx-auto grid min-h-150 max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-12 md:px-12 md:py-32">
        <div className="md:col-span-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_currentColor]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-teal-200">{hero.eyebrow}</span>
          </motion.div>

          <KineticText
            as="h1"
            text="Your GitHub already proves you can do the job."
            className="mt-7 block text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-white md:text-6xl"
          />
          <KineticText
            as="span"
            stagger={0.05}
            text="Now your resume can."
            className="mt-2 block bg-linear-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-4xl font-semibold leading-[1.04] tracking-tight text-transparent md:text-6xl"
          />

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>
              ⌥ {hero.primaryCta}
            </MagneticButton>
            <MagneticButton onClick={() => navigate({ to: '/sign-in' })}>
              {hero.secondaryCta}
            </MagneticButton>
          </div>
          <div className="mt-5 font-mono text-[11px] text-zinc-500">{hero.founderNote}</div>
        </div>

        <div className="hidden md:col-span-6 md:block">
          <div className="flex flex-col gap-4 perspective-[1000px]">
            <RepoBand speed={40} />
            <RepoBand reverse speed={52} />
          </div>
        </div>
      </div>

      {/* Mobile repo band below the fold of the hero copy */}
      <div className="relative block pb-10 md:hidden">
        <RepoBand speed={36} />
      </div>
    </div>
  )
}
