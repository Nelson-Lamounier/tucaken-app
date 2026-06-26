"use client"
// src/features/home/sections/Sections.tsx
// Re-usable below-the-fold sections (Problem, HowItWorks, Comparison, Founder, Pricing, FAQ, Footer).
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import NumberFlow from '@number-flow/react'
import type { Tier } from '@/features/billing/catalog'
import { MagneticButton } from '../lib/MagneticButton'
import { Marquee } from '../lib/Marquee'
import { KineticText } from '../lib/KineticText'
import { comparison, founder, faq } from '../content'
import { highlightParts } from '../lib/highlight'
import { tiersFromPublic } from '@/features/billing/catalog'
import { getPublicTierConfigFn } from '@/server/tier-config'
import { SparkleField } from '../lib/SparkleField'
import { tierCtaTarget } from '../lib/pricing-cta'
import { OrbitalComparison } from '../lib/OrbitalComparison'

function Section({ children, id, className = '' }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6 }}
      className={['relative px-6 py-20 md:px-12', className].join(' ')}
    >
      {children}
    </motion.section>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{children}</div>
}

export type Frequency = 'monthly' | 'annually'

const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'Monthly',
  annually: 'Annually',
}

export function BillingToggle({
  value,
  onChange,
}: {
  value: Frequency
  onChange: (v: Frequency) => void
}) {
  const options: Frequency[] = ['monthly', 'annually']
  return (
    <div className="mt-10 flex justify-center">
      <div
        role="radiogroup"
        aria-label="Billing frequency"
        className="grid grid-cols-2 gap-x-1 rounded-full p-1 font-mono text-[11px] uppercase tracking-widest inset-ring inset-ring-white/10"
      >
        {options.map((opt) => {
          const active = value === opt
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt)}
              className="relative cursor-pointer rounded-full px-4 py-1.5"
            >
              {active && (
                <motion.span
                  layoutId="billing-pill"
                  className="absolute inset-0 rounded-full bg-teal-500"
                  style={{ willChange: 'transform' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className={active ? 'relative text-zinc-950' : 'relative text-zinc-400'}>
                {FREQUENCY_LABEL[opt]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TierPrice({ tier, isYearly }: { tier: Tier; isYearly: boolean }) {
  if (tier.free) {
    return <p className="mt-6 text-4xl font-semibold tracking-tight text-white">Free</p>
  }
  const value = isYearly ? tier.priceAnnual : tier.priceMonthly
  return (
    <p className="mt-6 flex items-baseline gap-x-1">
      <NumberFlow
        value={value}
        format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }}
        className="text-4xl font-semibold tracking-tight text-white"
      />
      <span className="text-sm/6 font-semibold text-zinc-500">
        {isYearly ? '/year' : '/month'}
      </span>
    </p>
  )
}

export function ComparisonSection() {
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>Why Tucaken</Eyebrow>
        <KineticText
          as="h2"
          text="What other AI resume tools can't say."
          className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
        />
        <p className="mt-4 max-w-xl text-pretty text-sm text-zinc-400 md:text-base">
          Tap a node to see how Tucaken answers — grounded in your real work, not
          generic filler.
        </p>
        <div className="mt-8">
          <OrbitalComparison items={comparison} />
        </div>
      </div>
    </Section>
  )
}

export function FounderSection() {
  const reduce = useReducedMotion() ?? false
  const parts = highlightParts(founder.quote, 'Tucaken Resumes')
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <Eyebrow>Built by a user, for users</Eyebrow>

        <motion.blockquote
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={reduce ? undefined : { willChange: 'transform, opacity' }}
          className="mt-6 text-balance text-xl leading-relaxed text-zinc-100 sm:text-2xl"
        >
          &ldquo;
          {parts.map((part, i) =>
            part.highlight ? (
              <strong key={`${part.text}-${i}`} className="font-semibold text-teal-300">
                {part.text}
              </strong>
            ) : (
              <span key={`${part.text}-${i}`}>{part.text}</span>
            ),
          )}
          &rdquo;
        </motion.blockquote>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
          style={reduce ? undefined : { willChange: 'transform, opacity' }}
        >
          <div className="mt-6 font-medium text-zinc-300">{founder.name}</div>
          <div className="mt-1.5 text-sm text-zinc-500">{founder.role}</div>
        </motion.div>
      </div>
    </Section>
  )
}

export function PricingSection() {
  const navigate = useNavigate()
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const isYearly = frequency === 'annually'
  // Live, admin-editable tier display. Falls back to the static TIERS catalog
  // while loading or if the public endpoint is unreachable.
  const { data: publicConfig } = useQuery({
    queryKey: ['public-tier-config'],
    queryFn: getPublicTierConfigFn,
  })
  const tiers = tiersFromPublic(publicConfig)
  return (
    <Section id="pricing" className="overflow-hidden border-t border-white/5">
      {/* Reveal backdrop: twinkling sparkles + a soft teal glow, behind cards. */}
      <SparkleField className="z-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[10%] top-0 z-0 h-full"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 30%, rgba(45,212,191,0.16) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <KineticText
            as="h2"
            text="Free until it's worth paying for."
            className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
          />
          <p className="mx-auto mt-5 max-w-xl text-pretty text-sm text-zinc-400 md:text-base">
            Pick a tier that matches how often you ship. Switch or cancel any
            time — we prorate down to the day.
          </p>
        </div>

        <BillingToggle value={frequency} onChange={setFrequency} />

        <div className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-6 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {tiers.map((t) => (
            <motion.div
              key={t.id}
              data-featured={t.highlighted ? 'true' : undefined}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
              style={{ willChange: 'transform, opacity' }}
              className="group/tier relative rounded-3xl bg-white/[0.02] p-8 ring-1 ring-white/10 data-featured:ring-2 data-featured:ring-teal-500/60 xl:p-10"
            >
              {t.highlighted && (
                <div className="gradient-sweep-anim absolute -top-3 right-6 rounded-full bg-[linear-gradient(110deg,#14b8a6,#34d399,#14b8a6)] px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-950">
                  Recommended
                </div>
              )}
              <h3
                id={`tier-${t.id}`}
                className="font-mono text-xs uppercase tracking-widest text-zinc-400 group-data-featured/tier:text-teal-300"
              >
                {t.name}
              </h3>
              <p className="mt-3 text-sm/6 text-zinc-300">{t.blurb}</p>

              <TierPrice tier={t} isYearly={isYearly} />

              <MagneticButton
                primary={t.highlighted}
                className="mt-7 w-full"
                onClick={() => navigate(tierCtaTarget(t))}
              >
                {t.cta}
              </MagneticButton>

              <ul className="mt-8 space-y-3 text-sm/6 text-zinc-300 xl:mt-10">
                {t.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <span
                      aria-hidden="true"
                      className={t.highlighted ? 'mt-0.5 text-teal-400' : 'mt-0.5 text-zinc-500'}
                    >
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}


export function FAQSection() {
  const [open, setOpen] = useState<number>(0)
  return (
    <Section id="faq" className="border-t border-white/5">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Frequently asked</Eyebrow>
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">Last objections, handled.</h2>
        <div className="mt-10 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
          {faq.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setOpen(open === i ? -1 : i)}
              className="block w-full px-5 py-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-white">{f.q}</span>
                <span className={['font-mono text-lg text-zinc-500 transition-transform', open === i ? 'rotate-45' : ''].join(' ')}>+</span>
              </div>
              <AnimatePresence initial={false}>
                {open === i ? (
                  <motion.p
                    key="a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    style={{ overflow: 'hidden', willChange: 'opacity' }}
                    className="mt-3 text-sm leading-relaxed text-zinc-400"
                  >
                    {f.a}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

export function FooterSection() {
  const band = ['Resumes grounded in real code', 'Made in Dublin', 'Backed by your commits', 'No fabricated bullet points']
  return (
    <footer className="border-t border-white/5">
      <Marquee speed={30} className="border-b border-white/5 py-4 mask-[linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]">
        {band.concat(band).map((t, i) => (
          <span key={`${t}-${i}`} className="mx-6 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {t} <span className="text-teal-400">·</span>
          </span>
        ))}
      </Marquee>
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center md:px-12">
        <div>
          <div className="font-mono text-sm font-semibold text-white">tucaken</div>
          <div className="mt-1 text-xs text-zinc-500">Resumes grounded in real code. Made in Dublin.</div>
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            className="w-64 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-teal-500/40 focus:outline-none"
            placeholder="you@dev.email"
          />
          <MagneticButton primary>Subscribe</MagneticButton>
        </div>
      </div>
    </footer>
  )
}
