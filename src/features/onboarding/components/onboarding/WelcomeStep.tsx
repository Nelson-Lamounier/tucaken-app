// src/features/onboarding/components/WelcomeStep.tsx
//
// Step 1 of the first-run flow. Greets the new user, runs the
// auto-advancing carousel, and offers a single "Get started" CTA.

import { COPY } from './content'
import { StepHeader } from './StepHeader'
import { WelcomeCarousel } from './WelcomeCarousel'
import { ArrowRight } from 'lucide-react'

interface Props {
  onNext: () => void
}

export function WelcomeStep({ onNext }: Props) {
  return (
    <div className="flex h-full flex-col">
      <StepHeader
        eyebrow={COPY.welcome.eyebrow}
        title={COPY.welcome.title}
        sub={COPY.welcome.sub}
      />

      <WelcomeCarousel />

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-teal-500 px-5 py-2 text-xs font-semibold text-zinc-950 shadow-[0_8px_30px_-12px_rgba(20,184,166,0.6)] transition hover:bg-teal-400"
        >
          {COPY.welcome.cta}
          <ArrowRight className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
