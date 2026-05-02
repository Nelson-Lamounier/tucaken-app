// src/features/home/sections/HeroSection.tsx
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { MeshBg } from '../lib/MeshBg'
import { Pipeline } from '../lib/Pipeline'
import { RepoCard } from '../lib/RepoCard'
import { hero, repos, interviewedAt } from '../content'

const RESUME_BULLETS = [
  { t: 'Architected zero-trust K8s network policies across 18 namespaces.', s: 'kustomize/base/network-policies.yaml · PR #284' },
  { t: 'Migrated 12 services from REST to event-driven (Kafka), 99.95% uptime.', s: 'event-driven-migration · ADR-007' },
  { t: 'Reduced infra cost 38% via spot-fleet autoscaling on EKS.', s: 'iac-aws-pipelines/spot.tf' },
]

export function HeroSection() {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 80, damping: 20 })
  const sy = useSpring(my, { stiffness: 80, damping: 20 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handle = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      mx.set(e.clientX - r.left)
      my.set(e.clientY - r.top)
    }
    el.addEventListener('mousemove', handle)
    return () => el.removeEventListener('mousemove', handle)
  }, [mx, my])

  const spotlight = useTransform(
    [sx, sy],
    ([x, y]) => `radial-gradient(420px circle at ${x}px ${y}px, oklch(0.7 0.18 175 / 0.18), transparent 70%)`,
  )

  return (
    <div ref={ref} className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
      <MeshBg intense />
      <motion.div className="pointer-events-none absolute -inset-px" style={{ background: spotlight }} />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-6 py-24 md:grid-cols-12 md:px-12 md:py-32">
        <div className="md:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_currentColor]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-teal-200">{hero.eyebrow}</span>
          </motion.div>

          <h1 className="mt-7 text-balance text-5xl font-semibold leading-[1.02] tracking-tight md:text-6xl">
            <motion.span
              initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.1, duration: 0.7 }}
              className="block text-white"
            >
              Your{' '}
              <span className="relative inline-block">
                <span className="relative z-10">GitHub</span>
                <motion.span
                  className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-teal-400/30"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                  style={{ transformOrigin: 'left' }}
                />
              </span>{' '}
              already proves
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.22, duration: 0.7 }}
              className="block text-white"
            >
              you can do the job.
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.34, duration: 0.7 }}
              className="block bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent"
            >
              Now your resume can.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-zinc-300 md:text-lg"
          >
            {hero.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>⌥ {hero.primaryCta}</MagneticButton>
            <MagneticButton onClick={() => navigate({ to: '/sign-in' })}>{hero.secondaryCta}</MagneticButton>
          </motion.div>
          <div className="mt-5 font-mono text-[11px] text-zinc-500">{hero.founderNote}</div>
        </div>

        <div className="relative md:col-span-5">
          <div className="relative h-[460px]" style={{ perspective: '1200px' }}>
            <motion.div
              initial={{ opacity: 0, rotateY: -20, x: 40 }}
              animate={{ opacity: 1, rotateY: -8, x: 0 }}
              transition={{ duration: 0.9 }}
              style={{ transformStyle: 'preserve-3d' }}
              className="absolute inset-0 rounded-2xl border border-white/10 bg-white p-5 shadow-2xl shadow-teal-900/40"
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">resume.pdf · grounded</div>
              <div className="mt-2 text-lg font-semibold text-zinc-900">Nelson — Senior DevOps Engineer</div>
              <div className="mt-3 space-y-2">
                {RESUME_BULLETS.map((b, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2 + i * 0.15 }}
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5"
                  >
                    <div className="text-[12px] leading-snug text-zinc-800">{b.t}</div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[9px] text-teal-800">
                      ↳ {b.s}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -40, y: 40 }}
              animate={{ opacity: 1, x: -28, y: 28 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="absolute -left-6 -top-4 w-56"
            >
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
                <RepoCard r={repos[0]} tilt />
              </motion.div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 40, y: -20 }}
              animate={{ opacity: 1, x: 28, y: -12 }}
              transition={{ duration: 0.9, delay: 0.35 }}
              className="absolute -right-4 bottom-2 w-56"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              >
                <RepoCard r={repos[1]} tilt />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="relative px-6 pb-12 md:px-12">
        <div className="mx-auto max-w-3xl">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
            <Pipeline />
          </motion.div>
        </div>
        <div className="mx-auto mt-16 max-w-3xl text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Users have interviewed at</div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-sm font-medium text-zinc-400">
            {interviewedAt.map((n) => (
              <span key={n} className="hover:text-zinc-200">
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
