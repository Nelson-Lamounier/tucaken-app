"use client"
// src/features/home/sections/HeroSection.tsx
import { motion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { ConveyorBelt } from '../lib/ConveyorBelt'
import { PipelineScene } from '../lib/PipelineScene'
import { hero } from '../content'

export function HeroSection() {
  const navigate = useNavigate()

  return (
    <div className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
      <ConveyorBelt />

      <div className="relative mx-auto grid min-h-[560px] max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-12 md:px-12 md:py-32">
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

          <h1 className="mt-7 text-balance text-4xl font-semibold leading-[1.02] tracking-tight md:text-6xl">
            <span className="block text-white">Your GitHub already proves</span>
            <span className="block text-white">you can do the job.</span>
            <span className="block bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
              Now your resume can.
            </span>
          </h1>

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
          <PipelineScene />
        </div>
      </div>
    </div>
  )
}
