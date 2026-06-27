"use client"
// src/features/home/HomePage.tsx
// Single-page Tucaken Home — energetic + spotlight + 3D resume + floating repos.
import { useState } from 'react'
import { MotionConfig, useScroll, useMotionValueEvent } from 'motion/react'
import { usePageTransition } from '@/contexts/PageTransition'
import { RippleButton } from './lib/RippleButton'
import { LandingCursor } from './lib/LandingCursor'
import { ScrollProgress } from './lib/ScrollProgress'
import { HeroSection } from './sections/HeroSection'
import {
  ValuePropSection,
  ComparisonSection,
  FounderSection,
  PricingSection,
  FAQSection,
  FooterSection,
} from './sections/Sections'
import { ScrollStorySection } from './sections/ScrollStorySection'
import logo from '@/images/logo-horizontal-resume-flat-teal.png'

function Header() {
  const { transitionTo, isPending } = usePageTransition()
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24))

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-30 border-b px-4 transition-all duration-300 md:px-6',
        scrolled ? 'border-white/10 bg-zinc-950/85 py-2 backdrop-blur-md' : 'border-transparent bg-transparent py-3',
      ].join(' ')}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center">
          <img src={logo} alt="Tucaken" className={['w-auto transition-all', scrolled ? 'h-12' : 'h-15'].join(' ')} />
        </div>
        <nav className="hidden items-center gap-8 text-base font-normal uppercase tracking-wide text-zinc-300 md:flex">
          <a href="#how" className="transition-colors hover:text-white">How it works</a>
          <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
          <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
        </nav>
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={isPending}
            onClick={() => transitionTo({ to: '/sign-in' })}
            className="hidden text-base font-normal uppercase tracking-wide text-zinc-300 transition-colors hover:text-white disabled:opacity-60 md:block"
          >
            Sign in
          </button>
          <RippleButton onClick={() => transitionTo({ to: '/sign-in' })}>Try free</RippleButton>
        </div>
      </div>
    </header>
  )
}

export function HomePage() {
  // `reducedMotion="user"` makes Motion auto-disable transform/layout
  // animations (the section whileInView reveals and the Pricing hover lift)
  // for visitors who prefer reduced motion, while keeping opacity fades.
  // Looping CSS marquees/sweeps are frozen separately via the styles.css
  // prefers-reduced-motion kill-switch; MeshBg guards its own filter loop.
  return (
    <MotionConfig reducedMotion="user">
      <div className="dark min-h-screen bg-zinc-950 text-white antialiased">
        <LandingCursor />
        <ScrollProgress />
        <Header />
        <HeroSection />
        <ValuePropSection />
        <ScrollStorySection />
        <ComparisonSection />
        <FounderSection />
        <PricingSection />
        <FAQSection />
        <FooterSection />
      </div>
    </MotionConfig>
  )
}
