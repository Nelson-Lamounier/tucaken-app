"use client"
// src/features/home/HomePage.tsx
// Single-page Tucaken Home — energetic + spotlight + 3D resume + floating repos.
import { Link, useNavigate } from '@tanstack/react-router'
import { MagneticButton } from './lib/MagneticButton'
import { HeroSection } from './sections/HeroSection'
import {
  ProblemSection,
  HowItWorksSection,
  ComparisonSection,
  FounderSection,
  PricingSection,
  FAQSection,
  FooterSection,
} from './sections/Sections'
import logo from '@/images/logo.png'

function Header() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-6 py-3 backdrop-blur-md md:px-12">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center">
          <img src={logo} alt="Tucaken" className="h-18 w-auto" />
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
  return (
    <div className="dark min-h-screen bg-zinc-950 text-white antialiased">
      <Header />
      <HeroSection />
      <HowItWorksSection />
      <ProblemSection />
      <ComparisonSection />
      <FounderSection />
      <PricingSection />
      <FAQSection />
      <FooterSection />
    </div>
  )
}
