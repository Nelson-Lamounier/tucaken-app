"use client"
// src/features/home/sections/HeroSection.tsx
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { RippleButton } from '../lib/RippleButton'
import { hero } from '../content'

interface Beam {
  x: number
  y: number
  width: number
  length: number
  angle: number
  speed: number
  opacity: number
  pulse: number
  pulseSpeed: number
  layer: number
}

const LAYERS = 3
const BEAMS_PER_LAYER = 8
// Brand teal-400 (#2dd4bf) so the beams read on-palette, not raw cyan.
const BEAM_RGB = '45,212,191'

// Deterministic PRNG (mulberry32) for the decorative beam placement. Avoids
// Math.random — the values are purely visual, not security-sensitive — and keeps
// the field stable across renders.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createBeam(width: number, height: number, layer: number, rng: () => number): Beam {
  const angle = -35 + rng() * 10
  const baseSpeed = 0.2 + layer * 0.2
  const baseOpacity = 0.08 + layer * 0.05
  const baseWidth = 10 + layer * 5
  return {
    x: rng() * width,
    y: rng() * height,
    width: baseWidth,
    length: height * 2.5,
    angle,
    speed: baseSpeed + rng() * 0.2,
    opacity: baseOpacity + rng() * 0.1,
    pulse: rng() * Math.PI * 2,
    pulseSpeed: 0.01 + rng() * 0.015,
    layer,
  }
}

function useBeamCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const beamsRef = useRef<Beam[]>([])
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const rng = makeRng(0x9e3779b9)

    const seedBeams = (w: number, h: number) => {
      beamsRef.current = []
      for (let layer = 1; layer <= LAYERS; layer++) {
        for (let i = 0; i < BEAMS_PER_LAYER; i++) {
          beamsRef.current.push(createBeam(w, h, layer, rng))
        }
      }
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      seedBeams(w, h)
    }

    const drawBeam = (beam: Beam) => {
      ctx.save()
      ctx.translate(beam.x, beam.y)
      ctx.rotate((beam.angle * Math.PI) / 180)
      const o = Math.min(1, beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.4))
      const g = ctx.createLinearGradient(0, 0, 0, beam.length)
      g.addColorStop(0, `rgba(${BEAM_RGB},0)`)
      g.addColorStop(0.2, `rgba(${BEAM_RGB},${o * 0.5})`)
      g.addColorStop(0.5, `rgba(${BEAM_RGB},${o})`)
      g.addColorStop(0.8, `rgba(${BEAM_RGB},${o * 0.5})`)
      g.addColorStop(1, `rgba(${BEAM_RGB},0)`)
      ctx.fillStyle = g
      ctx.filter = `blur(${2 + beam.layer * 2}px)`
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length)
      ctx.restore()
    }

    const paint = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#050505')
      bg.addColorStop(1, '#111111')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < beamsRef.current.length; i++) drawBeam(beamsRef.current[i])
    }

    const animate = () => {
      const h = canvas.clientHeight
      const w = canvas.clientWidth
      for (let i = 0; i < beamsRef.current.length; i++) {
        const beam = beamsRef.current[i]
        beam.y -= beam.speed * (beam.layer / LAYERS + 0.5)
        beam.pulse += beam.pulseSpeed
        if (beam.y + beam.length < -50) {
          beam.y = h + 50
          beam.x = rng() * w
        }
      }
      paint()
      frameRef.current = requestAnimationFrame(animate)
    }

    resize()
    window.addEventListener('resize', resize)

    // Respect reduced-motion: render a single static frame, no rAF loop.
    if (reduced) paint()
    else animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return canvasRef
}

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
          className="absolute whitespace-nowrap bg-linear-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-4xl font-semibold text-transparent md:text-5xl lg:text-6xl"
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
  const navigate = useNavigate()
  const canvasRef = useBeamCanvas()

  return (
    <div className="relative h-screen w-full overflow-hidden border-b border-white/5 bg-zinc-950">
      <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full" />

      <div className="relative z-10 flex h-full w-full items-center justify-center px-6 text-center">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8">
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

          <h1 className="w-full text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-white md:text-6xl lg:text-7xl">
            <span className="block">{hero.headlineLead}</span>
            <RotatingWord />
          </h1>

          <p className="max-w-3xl text-balance text-base leading-relaxed text-zinc-300 md:text-lg">
            {hero.sub}
          </p>

          <div className="flex items-center justify-center">
            <RippleButton onClick={() => navigate({ to: '/sign-in' })}>
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
