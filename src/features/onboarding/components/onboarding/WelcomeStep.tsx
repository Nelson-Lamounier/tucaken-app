// src/features/onboarding/components/WelcomeStep.tsx
//
// Step 1 of the first-run flow. Greets the new user, runs the
// auto-advancing carousel, and offers a single "Get started" CTA.

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { COPY } from './content'
import { StepHeader } from './StepHeader'
import { WelcomeCarousel } from './WelcomeCarousel'
import { ArrowRight } from 'lucide-react'
import { MotionButton } from '@/components/ui/MotionButton'

interface Props {
  onNext: () => void
}

export function WelcomeStep({ onNext }: Readonly<Props>) {
  // Carousel stays hidden until the intro copy has finished typing.
  const [introDone, setIntroDone] = useState(false)

  return (
    <div className="flex flex-1 flex-col">
      <StepHeader
        eyebrow={COPY.welcome.eyebrow}
        title={COPY.welcome.title}
        sub={COPY.welcome.sub}
        typewriter
        onTypingComplete={() => setIntroDone(true)}
      />

      <AnimatePresence>
        {introDone && (
          <motion.div
            key="welcome-carousel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}
          >
            <WelcomeCarousel />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto flex justify-end pt-8">
        <MotionButton variant="primary" size="lg" onClick={onNext}>
          {COPY.welcome.cta}
          <ArrowRight className="size-3.5" strokeWidth={2.5} />
        </MotionButton>
      </div>
    </div>
  )
}
