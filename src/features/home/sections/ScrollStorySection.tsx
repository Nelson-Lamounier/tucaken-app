"use client"
// Page-scroll-driven sticky scroll-story for Problem -> HowItWorks. The outer
// section is slides*100vh tall; an inner panel pins (sticky top-0). useScroll on
// the section maps progress -> active slide. Mobile + reduced-motion fall back
// to a plain stacked layout (no pin/scrub).
import type * as React from 'react'
import { useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { MOCKS } from '../lib/proof-mocks'
import { buildStorySlides, activeIndexFromProgress, type StorySlide } from '../lib/story-data'

const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
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
          <div aria-live="polite" className="max-w-md">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{slide.eyebrow}</div>
            <motion.h2
              key={`${slide.id}-t`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ willChange: 'transform, opacity' }}
              className="text-balance text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              key={`${slide.id}-b`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              style={{ willChange: 'transform, opacity' }}
              className={[
                'mt-5 text-lg leading-relaxed',
                slide.phase === 'problem' ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-300',
              ].join(' ')}
            >
              {slide.body}
            </motion.p>
          </div>
          <div className="absolute bottom-16 left-12 lg:left-20">
            <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>
              Try it free with your GitHub
            </MagneticButton>
          </div>
        </div>

        {/* Right: grid bg + vertical mock stack translated by active index */}
        <div className="relative flex items-center justify-center" style={GRID_STYLE}>
          <div className="relative h-[78vh] w-full max-w-md overflow-hidden">
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
            <h2 className="text-balance text-2xl font-bold tracking-tight text-white">{s.title}</h2>
            <p
              className={[
                'mt-3 text-base leading-relaxed',
                s.phase === 'problem' ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-300',
              ].join(' ')}
            >
              {s.body}
            </p>
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
                <h2 className="text-balance text-2xl font-bold tracking-tight text-white md:text-3xl">{s.title}</h2>
                <p className={['mt-3 text-base leading-relaxed', s.phase === 'problem' ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-300'].join(' ')}>
                  {s.body}
                </p>
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
