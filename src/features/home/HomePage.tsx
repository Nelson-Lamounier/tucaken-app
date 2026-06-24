"use client"
// src/features/home/HomePage.tsx
// Single-page Tucaken Home — energetic + spotlight + 3D resume + floating repos.
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { MotionConfig, useScroll, useMotionValueEvent } from 'motion/react'
import { MagneticButton } from './lib/MagneticButton'
import { ScrollProgress } from './lib/ScrollProgress'
import { HeroSection } from './sections/HeroSection'
import {
  ComparisonSection,
  FounderSection,
  PricingSection,
  FAQSection,
  FooterSection,
} from './sections/Sections'
import { ScrollStorySection } from './sections/ScrollStorySection'
import logo from '@/images/logo.png'

function Header() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24))

  return (
    <header
      className={[
        'sticky top-0 z-30 border-b px-6 backdrop-blur-md transition-all duration-300 md:px-12',
        scrolled ? 'border-zinc-200/80 bg-white/95 py-2' : 'border-transparent bg-white/80 py-3',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center">
          <img src={logo} alt="Tucaken" className={['w-auto transition-all', scrolled ? 'h-14' : 'h-18'].join(' ')} />
        </div>
        <nav className="hidden items-center gap-6 font-mono text-xs text-zinc-500 md:flex">
          <a href="#how" className="hover:text-zinc-900">How it works</a>
          <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
          <a href="#faq" className="hover:text-zinc-900">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/sign-in" className="hidden font-mono text-xs text-zinc-500 hover:text-zinc-900 md:block">
            Sign in
          </Link>
          <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>Try free</MagneticButton>
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
        <ScrollProgress />
        <Header />
        <HeroSection />
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
