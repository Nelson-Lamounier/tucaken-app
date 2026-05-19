"use client"
// src/features/home/sections/HeroSection.tsx
import { motion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { MeshBg } from '../lib/MeshBg'
import { PipelineStage } from '../lib/PipelineStage'
import { hero } from '../content'

export function HeroSection() {
  const navigate = useNavigate()

  return (
    <div className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
      <MeshBg intense />

      <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-12 md:py-32">
        <PipelineStage>
          <div className="flex h-full max-w-2xl flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 backdrop-blur-md"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_currentColor]" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-teal-200">{hero.eyebrow}</span>
            </motion.div>

            <h1 className="mt-7 text-balance text-4xl font-semibold leading-[1.02] tracking-tight md:text-6xl">
              <motion.span
                initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 0.1, duration: 0.7 }}
                style={{ willChange: 'transform, filter' }}
                className="block text-white"
              >
                Your GitHub already proves
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 0.22, duration: 0.7 }}
                style={{ willChange: 'transform, filter' }}
                className="block text-white"
              >
                you can do the job.
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 0.34, duration: 0.7 }}
                style={{ willChange: 'transform, filter' }}
                className="block bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent"
              >
                Now your resume can.
              </motion.span>
            </h1>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>
                ⌥ {hero.primaryCta}
              </MagneticButton>
              <MagneticButton onClick={() => navigate({ to: '/sign-in' })}>
                {hero.secondaryCta}
              </MagneticButton>
            </motion.div>
            <div className="mt-5 font-mono text-[11px] text-zinc-500">{hero.founderNote}</div>
          </div>
        </PipelineStage>
      </div>
    </div>
  )
}
