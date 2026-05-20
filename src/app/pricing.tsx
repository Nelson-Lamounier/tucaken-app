"use client"
// src/app/pricing.tsx
//
// Public /pricing route. Reuses the home-page PricingSection so the cards,
// copy, and CTAs stay in lock-step. Useful as a direct link target from
// marketing, footer, or in-app upsell prompts.

import { createFileRoute } from '@tanstack/react-router'
import { PricingSection } from '@/features/home/sections/Sections'

export const Route = createFileRoute('/pricing')({
  component: PricingRoute,
})

function PricingRoute() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      <PricingSection />
    </main>
  )
}
