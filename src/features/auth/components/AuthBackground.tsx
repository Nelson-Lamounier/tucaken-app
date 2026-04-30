"use client"
// src/features/auth/components/AuthBackground.tsx
import { motion } from 'motion/react'

interface AuthBackgroundProps {
  variant?: 'safe' | 'energetic' | 'experimental'
}

export function AuthBackground({ variant = 'safe' }: AuthBackgroundProps) {
  if (variant === 'safe') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        <motion.div
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-teal-400/30 blur-3xl dark:bg-teal-500/20"
          animate={{ x: [0, 80, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'transform' }}
        />
        <motion.div
          className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-emerald-400/25 blur-3xl dark:bg-emerald-500/20"
          animate={{ x: [0, -60, 0], y: [0, -50, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'transform' }}
        />
      </div>
    )
  }

  if (variant === 'energetic') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-zinc-950">
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(60% 50% at 20% 20%, oklch(0.72 0.14 175 / 0.55), transparent 60%), radial-gradient(55% 45% at 80% 30%, oklch(0.68 0.18 155 / 0.5), transparent 60%), radial-gradient(70% 60% at 50% 90%, oklch(0.55 0.13 200 / 0.45), transparent 60%)',
            willChange: 'filter',
          }}
          animate={{ filter: ['hue-rotate(0deg)', 'hue-rotate(20deg)', 'hue-rotate(0deg)'] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'conic-gradient(from 0deg at 50% 50%, oklch(0.72 0.14 175 / 0.25), transparent 25%, oklch(0.68 0.18 155 / 0.25) 50%, transparent 75%, oklch(0.72 0.14 175 / 0.25))',
            willChange: 'transform',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence baseFrequency=%220.9%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.5%22/></svg>')] opacity-[0.04] mix-blend-overlay" />
      </div>
    )
  }

  // experimental
  const particles = Array.from({ length: 38 }, (_, i) => i)
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-zinc-950">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(60% 60% at 50% 50%, oklch(0.55 0.13 175 / 0.4), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      {particles.map((i) => {
        const size = 2 + (i % 5)
        const left = (i * 37) % 100
        const top = (i * 53) % 100
        const dur = 8 + (i % 7)
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-teal-300/70"
            style={{ width: size, height: size, left: `${left}%`, top: `${top}%`, willChange: 'transform, opacity' }}
            animate={{ y: [0, -40, 0], opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
          />
        )
      })}
    </div>
  )
}
