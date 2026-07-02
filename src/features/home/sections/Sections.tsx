"use client"
// src/features/home/sections/Sections.tsx
// Re-usable below-the-fold sections (Problem, HowItWorks, Comparison, Founder, Pricing, FAQ, Footer).
import { motion, AnimatePresence, useReducedMotion, useInView } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { usePageTransition } from '@/contexts/PageTransition'
import { Github, Linkedin, Mail, ArrowUpRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import NumberFlow from '@number-flow/react'
import type { Tier } from '@/features/billing/catalog'
import { MagneticButton } from '../lib/MagneticButton'
import { Marquee } from '../lib/Marquee'
import { KineticText } from '../lib/KineticText'
import { comparison, founder, hero } from '../content'
import { resolveDisplayStats } from '../lib/stats'
import { CookiePreferencesLink } from '../../consent/components/CookiePreferencesLink'
import { StatCard } from '@/components/ui/StatCard'
import { faqCategories } from '../lib/faq'
import { highlightParts } from '../lib/highlight'
import { tiersFromPublic } from '@/features/billing/catalog'
import { trackCtaClick, trackSocialClick } from '@/lib/observability/analytics'
import { getPublicTierConfigFn } from '@/server/tier-config'
import { getPublicStatsFn } from '@/server/public-stats'
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

export function TierPrice({ tier, isYearly, revealed = true }: { tier: Tier; isYearly: boolean; revealed?: boolean }) {
  if (tier.free) {
    return <p className="mt-6 text-4xl font-semibold tracking-tight text-white">Free</p>
  }
  // Annual billing is not charged in v1 — keep the toggle working but show that
  // the yearly plan is on the way rather than a chargeable price.
  if (isYearly) {
    return (
      <p className="mt-6 flex items-baseline gap-x-2">
        <span className="text-3xl font-semibold tracking-tight text-white">Coming soon</span>
        <span className="text-sm/6 font-medium text-zinc-500">annual billing</span>
      </p>
    )
  }
  return (
    <p className="mt-6 flex items-baseline gap-x-1">
      <NumberFlow
        value={revealed ? tier.priceMonthly : 0}
        format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }}
        className="text-4xl font-semibold tracking-tight text-white"
      />
      <span className="text-sm/6 font-semibold text-zinc-500">/month</span>
    </p>
  )
}

export function ComparisonSection() {
  return (
    <Section id="why" className="border-t border-white/5">
      {/* Header sits above the orbit (z-10) so the nodes fly in from behind it. */}
      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <Eyebrow>Why Tucaken</Eyebrow>
        <KineticText
          as="h2"
          text="What other AI resume tools can't say."
          className="text-balance text-4xl font-bold leading-[1.08] tracking-tight text-white lg:text-5xl"
        />
        <p className="mx-auto mt-4 max-w-md text-pretty text-sm text-zinc-400 md:text-base">
          Tap a node to see how Tucaken answers — grounded in your real work, not
          generic filler.
        </p>
      </div>
      {/* Wider than the header so the side card has room beside the orbit ring;
          z-0 keeps the flying-in nodes behind the header. */}
      <div className="relative z-0 mx-auto mt-20 max-w-7xl md:mt-24">
        <OrbitalComparison items={comparison} />
      </div>
    </Section>
  )
}

export function ValuePropSection() {
  const reduce = useReducedMotion() ?? false
  const parts = highlightParts(hero.sub, 'real evidence behind every claim')
  // Live platform counts. Each figure stays hidden until its real count clears
  // its floor, so tiny early-stage numbers never surface. While loading (or if
  // the endpoint is unreachable) only the static claim below is shown.
  const { data: live } = useQuery({
    queryKey: ['public-stats'],
    queryFn: getPublicStatsFn,
  })
  const displayStats = resolveDisplayStats(live)
  return (
    <Section id="value" className="border-t border-white/5">
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <Eyebrow>How Tucaken works</Eyebrow>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={reduce ? undefined : { willChange: 'transform, opacity' }}
          className="mt-6 text-balance font-heading text-lg leading-relaxed text-zinc-100 sm:text-xl"
        >
          {parts.map((part, i) =>
            part.highlight ? (
              <strong key={`${part.text}-${i}`} className="font-semibold text-teal-300">
                {part.text}
              </strong>
            ) : (
              <span key={`${part.text}-${i}`}>{part.text}</span>
            ),
          )}
        </motion.p>
      </div>

      <div className="mx-auto mt-16 grid max-w-5xl justify-items-center gap-12 px-2 sm:grid-cols-3 sm:gap-20">
        {displayStats.map((stat) => (
          <StatCard key={stat.label} value={stat.value} suffix={stat.suffix} label={stat.label} />
        ))}
      </div>
    </Section>
  )
}

export function FounderSection() {
  const reduce = useReducedMotion() ?? false
  const parts = highlightParts(founder.quote, 'Tucaken Resumes')
  return (
    <Section id="founder" className="border-t border-white/5">
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <Eyebrow>Built by a user, for users</Eyebrow>

        <motion.blockquote
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={reduce ? undefined : { willChange: 'transform, opacity' }}
          className="mt-6 text-balance font-heading text-lg leading-relaxed text-zinc-100 sm:text-xl"
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
  const { transitionTo } = usePageTransition()
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const isYearly = frequency === 'annually'
  // Live, admin-editable tier display. Falls back to the static TIERS catalog
  // while loading or if the public endpoint is unreachable.
  const { data: publicConfig } = useQuery({
    queryKey: ['public-tier-config'],
    queryFn: getPublicTierConfigFn,
  })
  const tiers = tiersFromPublic(publicConfig)
  // Roll the prices up from 0 once the grid scrolls into view (NumberFlow digit
  // animation). Reduced-motion users skip straight to the real figure.
  const gridRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion() ?? false
  const priceRevealed = useInView(gridRef, { once: true }) || reduce
  return (
    <Section id="pricing" className="overflow-hidden border-t border-white/5">
      {/* Reveal backdrop: twinkling sparkles + a soft teal glow, behind cards. */}
      <SparkleField className="z-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
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

        <div ref={gridRef} className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-6 lg:mx-0 lg:max-w-none lg:grid-cols-3">
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
              className="group/tier relative rounded-lg bg-white/[0.02] p-6 ring-1 ring-white/10 data-featured:ring-2 data-featured:ring-teal-500/60 sm:rounded-xl sm:p-8 xl:p-10"
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

              <TierPrice tier={t} isYearly={isYearly} revealed={priceRevealed} />

              <MagneticButton
                primary={t.highlighted}
                className="mt-7 w-full"
                onClick={() => {
                  trackCtaClick(t.cta, `pricing_${t.id}`)
                  transitionTo(tierCtaTarget(t))
                }}
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


// Composite id (category:item) of the first published item — open by default.
const FIRST_FAQ = faqCategories[0]?.items[0]
const FIRST_OPEN = FIRST_FAQ ? `${faqCategories[0].id}:${FIRST_FAQ.id}` : null

export function FAQSection() {
  const [open, setOpen] = useState<string | null>(FIRST_OPEN)
  return (
    <Section id="faq" className="border-t border-white/5">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Frequently asked</Eyebrow>
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">Questions, answered.</h2>
        <div className="mt-10 space-y-8">
          {faqCategories.map((cat) => (
            <div key={cat.id}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">{cat.title}</h3>
              <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
                {cat.items.map((item) => {
                  const id = `${cat.id}:${item.id}`
                  const isOpen = open === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOpen(isOpen ? null : id)}
                      className="block w-full px-5 py-4 text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-white">{item.question}</span>
                        <span className={['font-mono text-lg text-zinc-500 transition-transform', isOpen ? 'rotate-45' : ''].join(' ')}>+</span>
                      </div>
                      <AnimatePresence initial={false}>
                        {isOpen ? (
                          <motion.p
                            key="a"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                            style={{ overflow: 'hidden', willChange: 'opacity' }}
                            className="mt-3 text-sm leading-relaxed text-zinc-400"
                          >
                            {item.answer}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

type FooterLink = { label: string; to?: string; href?: string }
type FooterColumn = { heading: string; links: FooterLink[] }

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Why Tucaken', href: '#why' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Our story', href: '#founder' },
      { label: 'Sign in', to: '/sign-in' },
      { label: 'Get started', to: '/pricing' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms & Conditions', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Cookie Policy', to: '/cookies' },
    ],
  },
]

const FOOTER_SOCIALS = [
  { label: 'GitHub', platform: 'GitHub', href: 'https://github.com/Nelson-Lamounier', Icon: Github },
  { label: 'LinkedIn', platform: 'LinkedIn', href: 'https://www.linkedin.com/in/nelson-lamounier-leao', Icon: Linkedin },
  { label: 'Email support', platform: 'Email', href: 'mailto:support@tucaken.com', Icon: Mail },
] as const

function FooterNavLink({ link }: { link: FooterLink }) {
  const className =
    'group inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white'
  if (link.to) {
    return (
      <Link to={link.to} className={className}>
        {link.label}
      </Link>
    )
  }
  return (
    <a href={link.href} className={className}>
      {link.label}
    </a>
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

      <div className="mx-auto max-w-5xl px-6 py-14 md:px-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand + newsletter */}
          <div className="md:col-span-5">
            <div className="font-mono text-base font-semibold lowercase tracking-tight text-white">tucaken</div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-400">
              Resumes grounded in your real code — backed by your commits, never fabricated. Made in Dublin.
            </p>

            <div className="mt-6">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Newsletter</div>
              <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/2 px-3 py-2 text-sm text-zinc-400">
                <span className="size-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                Coming soon
              </div>
            </div>

            <div className="mt-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Contact</div>
              <a
                href="mailto:support@tucaken.com"
                onClick={() => trackSocialClick('Email', 'mailto:support@tucaken.com')}
                className="mt-2 inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white"
              >
                support@tucaken.com
                <ArrowUpRight className="size-3" />
              </a>
            </div>

            <div className="mt-6 flex items-center gap-3">
              {FOOTER_SOCIALS.map(({ label, platform, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  onClick={() => trackSocialClick(platform, href)}
                  target={href.startsWith('mailto:') ? undefined : '_blank'}
                  rel="noreferrer"
                  aria-label={label}
                  className="flex size-9 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-colors hover:border-teal-500/40 hover:text-white"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Spacer on desktop */}
          <div className="hidden md:col-span-1 md:block" />

          {/* Link columns */}
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading} className="md:col-span-3">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{column.heading}</h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterNavLink link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/5 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center">
          <p>&copy; {new Date().getFullYear()} Tucaken. All rights reserved.</p>
          <p className="font-mono uppercase tracking-[0.18em]">Made in Dublin</p>
          <CookiePreferencesLink className="text-xs text-zinc-500 transition-colors hover:text-white" />
        </div>
      </div>
    </footer>
  )
}
