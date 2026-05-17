// src/features/onboarding/components/WelcomeCarousel.tsx
//
// Auto-advancing 4-slide carousel used on the Welcome step. Slides
// crossfade-and-rise every 5.5s; users can manually click dots.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CAROUSEL_SLIDES } from './content'
import { CarouselVisual } from './CarouselVisual'

const ADVANCE_MS = 5500

export function WelcomeCarousel() {
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setSlide((s) => (s + 1) % CAROUSEL_SLIDES.length)
    }, ADVANCE_MS)
    return () => clearInterval(id)
  }, [])

  const current = CAROUSEL_SLIDES[slide]

  return (
    <div className="relative overflow-hidden rounded-xl p-3 md:p-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="grid min-h-55 grid-cols-1 gap-8 p-8 md:grid-cols-2 md:p-10"
        >
          <div className="flex flex-col justify-center">
            <h3 className="mb-1.5 text-balance text-base font-semibold text-zinc-100">
              {current.title}
            </h3>
            <p className="text-xs leading-relaxed text-zinc-400">{current.body}</p>
            {current.kind === 'checklist' && current.items && (
              <ul className="mt-4 space-y-2">
                {current.items.map((item, i) => (
                  <motion.li
                    key={item.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.1 }}
                    className="flex items-center gap-2.5 text-xs"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-teal-400/30 bg-teal-500/10 text-[10px] font-semibold text-teal-200">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-zinc-300">{item.label}</span>
                    <span className="text-zinc-600">{item.time}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
          <div className="hidden md:block">
            <CarouselVisual kind={current.kind} visual={current.visual} />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Dots */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
        {CAROUSEL_SLIDES.map((sl, i) => (
          <button
            key={sl.title}
            type="button"
            onClick={() => setSlide(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={[
              'h-1.5 rounded-full transition-all duration-300',
              i === slide ? 'w-5 bg-teal-400' : 'w-1.5 bg-white/15 hover:bg-white/30',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  )
}
