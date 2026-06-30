"use client"
// src/features/home/sections/HeroSection.tsx
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { usePageTransition } from '@/contexts/PageTransition'
import { trackCtaClick } from '@/lib/observability/analytics'
import { FloatingPaths } from '@/components/ui/FloatingPaths'
import { RippleButton } from '../lib/RippleButton'
import { hero } from '../content'

function RotatingWord() {
  const [index, setIndex] = useState(0)
  const words = hero.rotatingWords

  useEffect(() => {
    const id = setInterval(() => setIndex((prev) => (prev + 1) % words.length), 2500)
    return () => clearInterval(id)
  }, [words.length])

  return (
    <span className="relative mt-1 flex w-full justify-center overflow-hidden pb-3 md:pb-4">
      &nbsp;
      {words.map((word, i) => (
        <motion.span
          key={word}
          className="absolute whitespace-nowrap bg-linear-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-5xl font-bold text-transparent md:text-6xl xl:text-7xl"
          initial={{ opacity: 0, y: -120 }}
          transition={{ type: 'spring', stiffness: 50 }}
          animate={index === i ? { y: 0, opacity: 1 } : { y: index > i ? -150 : 150, opacity: 0 }}
          style={{ willChange: 'transform, opacity' }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}

export function HeroSection() {
  const { transitionTo } = usePageTransition()

  return (
    <div className="relative h-screen w-full overflow-hidden border-b border-white/5 bg-zinc-950">
      {/* Flowing-line backdrop (shared with the sign-in panel). The lines inherit
          teal from this wrapper's text colour. */}
      <div className="pointer-events-none absolute inset-0 text-teal-300/60">
        <FloatingPaths position={1} strokeScale={0.5} />
        <FloatingPaths position={-1} strokeScale={0.5} />
      </div>
      {/* Legibility veil — darkens the centre so the headline reads over the lines. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(9,9,11,0.75),transparent_70%)]" />

      <div className="relative z-10 flex h-full w-full items-center justify-center px-6 text-center">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-400/40 bg-teal-500/20 px-4 py-1.5 shadow-lg shadow-teal-500/20 backdrop-blur-md"
            style={{ willChange: 'opacity' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300 shadow-[0_0_8px_currentColor]" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-teal-50">{hero.eyebrow}</span>
          </motion.div>

          <h1 className="w-full text-balance text-5xl font-bold leading-[1.02] tracking-tight text-white md:text-7xl lg:text-8xl">
            <span className="block">{hero.headlineLead}</span>
            <RotatingWord />
          </h1>

          <div className="flex items-center justify-center">
            <RippleButton
              onClick={() => {
                trackCtaClick(hero.primaryCta, 'hero')
                transitionTo({ to: '/sign-in' })
              }}
            >
              {hero.primaryCta} <ArrowRight className="h-4 w-4" />
            </RippleButton>
          </div>

          <div className="font-mono text-[11px] text-zinc-400">{hero.ctaNote}</div>
          <div className="-mt-4 font-mono text-[11px] text-zinc-500">{hero.founderNote}</div>
        </div>
      </div>
    </div>
  )
}
