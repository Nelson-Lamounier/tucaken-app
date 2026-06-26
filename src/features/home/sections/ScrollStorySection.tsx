"use client"
// Page-scroll-driven sticky scroll-story for Problem -> HowItWorks. The outer
// section is slides*100vh tall; an inner panel pins (sticky top-0). useScroll on
// the section maps progress -> active slide. Mobile + reduced-motion fall back
// to a plain stacked layout (no pin/scrub).
import type * as React from 'react'
import { useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { RippleButton } from '../lib/RippleButton'
import { MOCKS } from '../lib/proof-mocks'
import { hero } from '../content'
import { buildStorySlides, activeIndexFromProgress, type StorySlide } from '../lib/story-data'

const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgba(45,212,191,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(45,212,191,0.07) 1px, transparent 1px)',
  backgroundSize: '3.5rem 3.5rem',
}

function Pagination({
  slides,
  active,
  onJump,
}: {
  slides: StorySlide[]
  active: number
  onJump: (i: number) => void
}) {
  return (
    <div className="flex gap-2">
      {slides.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onJump(i)}
          aria-label={`Go to slide ${i + 1}`}
          className={[
            'h-1 rounded-full transition-all duration-500',
            i === active ? 'w-10 bg-teal-400' : 'w-5 bg-white/20 hover:bg-white/40',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

function SlideTitle({ slide, variant }: { slide: StorySlide; variant: 'pinned' | 'stacked' }) {
  const pinned = variant === 'pinned'

  if (slide.phase === 'how' && slide.num) {
    return (
      <div className="flex items-start gap-4 lg:gap-6">
        <span
          aria-hidden
          className={[
            'font-heading font-bold leading-[0.8] tracking-tighter text-teal-400/25',
            pinned ? 'text-8xl lg:text-9xl' : 'text-7xl',
          ].join(' ')}
        >
          {slide.num}
        </span>
        <h2
          className={[
            'font-bold leading-[1.05] tracking-tight text-white',
            pinned ? 'max-w-[15rem] text-4xl lg:max-w-[22rem] lg:text-5xl' : 'max-w-[14rem] text-3xl',
          ].join(' ')}
        >
          {slide.title}
        </h2>
      </div>
    )
  }

  return (
    <h2
      className={[
        'text-balance font-bold leading-[1.08] tracking-tight text-white',
        pinned ? 'text-4xl lg:text-5xl' : 'text-3xl md:text-4xl',
      ].join(' ')}
    >
      {slide.title}
    </h2>
  )
}

function SlideBody({ slide, variant }: { slide: StorySlide; variant: 'pinned' | 'stacked' }) {
  const pinned = variant === 'pinned'

  if (slide.phase === 'problem' && slide.struck) {
    return (
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{slide.says}</span>
        <p
          className={[
            'mt-2 font-semibold leading-tight text-zinc-500 line-through decoration-rose-400/70 decoration-2',
            pinned ? 'text-2xl lg:text-3xl' : 'text-xl',
          ].join(' ')}
        >
          {slide.struck}
        </p>
        <p className={['mt-4 leading-relaxed text-zinc-200', pinned ? 'text-lg' : 'text-base'].join(' ')}>
          {slide.cost}
        </p>
      </div>
    )
  }

  return (
    <p
      className={[
        'leading-relaxed',
        pinned ? 'text-lg' : 'text-base',
        slide.phase === 'problem' ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-300',
      ].join(' ')}
    >
      {slide.body}
    </p>
  )
}

function PinnedStory({ slides }: { slides: StorySlide[] }) {
  const navigate = useNavigate()
  const sectionRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    setActive(activeIndexFromProgress(p, slides.length))
  })

  const jump = (i: number) => {
    const el = sectionRef.current
    if (!el) return
    const top = el.offsetTop + ((i + 0.5) / slides.length) * (el.offsetHeight - window.innerHeight)
    window.scrollTo({ top, behavior: 'smooth' })
  }

  const slide = slides[active]

  return (
    <div ref={sectionRef} className="relative hidden md:block" style={{ height: `${slides.length * 100}vh` }}>
      <div className="sticky top-0 grid h-screen grid-cols-2 overflow-hidden">
        {/* Left: text + pagination + CTA */}
        <div className="relative flex flex-col justify-center border-r border-white/5 px-12 lg:px-20">
          <div className="absolute left-12 top-16 lg:left-20">
            <Pagination slides={slides} active={active} onJump={jump} />
          </div>
          <div aria-live="polite" className="max-w-2xl">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{slide.eyebrow}</div>
            <motion.div
              key={`${slide.id}-t`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ willChange: 'transform, opacity' }}
            >
              <SlideTitle slide={slide} variant="pinned" />
            </motion.div>
            <motion.div
              key={`${slide.id}-b`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              style={{ willChange: 'transform, opacity' }}
              className="mt-6"
            >
              <SlideBody slide={slide} variant="pinned" />
            </motion.div>
          </div>
          <div className="absolute bottom-16 left-12 lg:left-20">
            <RippleButton onClick={() => navigate({ to: '/sign-in' })}>
              {hero.primaryCta} <ArrowRight className="h-4 w-4" />
            </RippleButton>
          </div>
        </div>

        {/* Right: layered colour background + vertical mock stack translated by active index */}
        <div className="relative flex items-center justify-center overflow-hidden bg-zinc-950">
          {/* teal-tinted grid */}
          <div className="absolute inset-0" style={GRID_STYLE} />
          {/* radial teal glow centred on the image */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(45,212,191,0.18),rgba(16,185,129,0.06)_38%,transparent_68%)]" />
          {/* soft glow blob for depth */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/15 blur-[120px]" />
          {/* edge vignette so the grid fades at the borders */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_55%,rgba(9,9,11,0.85))]" />

          <div className="relative h-[88vh] w-full max-w-4xl overflow-hidden">
            <div
              className="h-full w-full transition-transform duration-700 ease-in-out"
              style={{ transform: `translateY(-${active * 100}%)`, willChange: 'transform' }}
            >
              {slides.map((s) => {
                const SlideMock = MOCKS[s.mock]
                return (
                  <div key={s.id} className="h-full w-full">
                    <SlideMock />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StackedStory({ slides }: { slides: StorySlide[] }) {
  return (
    <div className="space-y-16 px-6 py-20 md:hidden">
      {slides.map((s) => {
        const Mock = MOCKS[s.mock]
        return (
          <div key={s.id}>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{s.eyebrow}</div>
            <SlideTitle slide={s} variant="stacked" />
            <div className="mt-4">
              <SlideBody slide={s} variant="stacked" />
            </div>
            <div className="mt-6 h-72">
              <Mock />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ScrollStorySection() {
  const reduce = useReducedMotion() ?? false
  const slides = buildStorySlides()

  return (
    <section id="how" className="relative border-t border-white/5 bg-zinc-950">
      {/* Reduced motion: stacked at all sizes. Otherwise: stacked < md, pinned >= md. */}
      {reduce ? (
        <div className="space-y-16 px-6 py-20">
          {slides.map((s) => {
            const Mock = MOCKS[s.mock]
            return (
              <div key={s.id}>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{s.eyebrow}</div>
                <SlideTitle slide={s} variant="stacked" />
                <div className="mt-4">
                  <SlideBody slide={s} variant="stacked" />
                </div>
                <div className="mt-6 h-72 max-w-md">
                  <Mock />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <StackedStory slides={slides} />
          <PinnedStory slides={slides} />
        </>
      )}
    </section>
  )
}
