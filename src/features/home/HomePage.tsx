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

function Header() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-zinc-950/60 px-6 py-3 backdrop-blur-md md:px-12">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 font-mono text-xs font-bold text-white">
            t
          </div>
          <span className="font-mono text-sm font-semibold text-white">tucaken</span>
        </div>
        <nav className="hidden items-center gap-6 font-mono text-xs text-zinc-400 md:flex">
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#pricing" className="hover:text-white">Pricing</a>
          <a href="#faq" className="hover:text-white">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="hidden font-mono text-xs text-zinc-400 hover:text-white md:block">
            Sign in
          </Link>
          <MagneticButton primary onClick={() => navigate({ to: '/auth' })}>Try free</MagneticButton>
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
