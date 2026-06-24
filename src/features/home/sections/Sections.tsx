"use client"
// src/features/home/sections/Sections.tsx
// Re-usable below-the-fold sections (Problem, HowItWorks, Comparison, Founder, Pricing, FAQ, Footer).
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { Marquee } from '../lib/Marquee'
import { KineticText } from '../lib/KineticText'
import { problems, steps, comparison, founder, faq } from '../content'
import { TIERS } from '@/features/billing/catalog'

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

export function ProblemSection() {
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>The problem</Eyebrow>
        <KineticText as="h2" text="You did the work. Your resume doesn't show it." className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {problems.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, rotate: -1 }}
              whileInView={{ opacity: 1, y: 0, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 90, damping: 15 }}
              style={{ willChange: 'transform, opacity' }}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-teal-500/30"
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-teal-400">Reality</div>
              <p className="mt-2 text-[15px] leading-relaxed text-white">{p.real}</p>
              <div className="my-4 h-px w-full bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">On your resume</div>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-400 line-through decoration-zinc-600">{p.deflated}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}

export function HowItWorksSection() {
  return (
    <Section id="how" className="border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>How it works</Eyebrow>
        <KineticText as="h2" text="Three steps. No magic." className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, type: 'spring', stiffness: 90, damping: 16 }}
              style={{ willChange: 'transform, opacity' }}
              className={[
                'relative rounded-2xl border p-6',
                'emp' in s && s.emp ? 'border-teal-500/40 bg-gradient-to-br from-teal-500/10 to-emerald-600/5' : 'border-white/10 bg-white/[0.02]',
              ].join(' ')}
            >
              <div className={['font-mono text-xs', 'emp' in s && s.emp ? 'text-teal-300' : 'text-zinc-500'].join(' ')}>{s.n}</div>
              <h3 className="mt-3 text-xl font-semibold text-white">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.d}</p>
              {'emp' in s && s.emp && (
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-teal-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-teal-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  The differentiator
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}

export function ComparisonSection() {
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>Why Tucaken</Eyebrow>
        <KineticText as="h2" text="What other AI resume tools can't say." className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
        <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/50">
          <div className="grid grid-cols-12 border-b border-white/10 bg-white/[0.03] font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            <div className="col-span-5 px-5 py-3">You ask</div>
            <div className="col-span-3 border-l border-white/10 px-5 py-3 text-zinc-500">Other tools</div>
            <div className="gradient-sweep-anim col-span-4 border-l border-white/10 bg-[linear-gradient(110deg,transparent,rgba(45,212,191,0.18),transparent)] px-5 py-3 text-teal-300">Tucaken</div>
          </div>
          {comparison.map((row, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              style={{ willChange: 'transform, opacity' }}
              className={['grid grid-cols-12 text-sm', i < comparison.length - 1 ? 'border-b border-white/5' : ''].join(' ')}
            >
              <div className="col-span-5 px-5 py-5 font-medium text-white">{row.q}</div>
              <div className="col-span-3 border-l border-white/10 px-5 py-5 text-zinc-500">{row.o}</div>
              <div className="col-span-4 border-l border-white/10 bg-teal-500/[0.04] px-5 py-5 text-zinc-100">
                <span className="text-teal-400">✓ </span>
                {row.t}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}

export function FounderSection() {
  const reduce = useReducedMotion() ?? false
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Built by a user, for users</Eyebrow>
        <div className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 p-8 backdrop-blur-md md:p-10">
          <div className="flex items-start gap-5">
            <motion.div
              animate={reduce ? undefined : { opacity: [0.85, 1, 0.85] }}
              transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={reduce ? undefined : { willChange: 'opacity' }}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 font-mono text-lg font-bold text-white"
            >
              N
            </motion.div>
            <div>
              <div className="text-base font-semibold text-white">{founder.name}</div>
              <div className="font-mono text-xs text-zinc-400">{founder.role}</div>
            </div>
          </div>
          <blockquote className="mt-6 whitespace-pre-line text-[17px] leading-relaxed text-zinc-200">
            "{founder.quote}"
          </blockquote>
          <div className="mt-6 flex items-center gap-3 font-mono text-xs">
            <a className="text-zinc-400 hover:text-teal-300" href="#">linkedin.com/in/nelson</a>
            <span className="text-zinc-700">·</span>
            <a className="text-zinc-400 hover:text-teal-300" href="#">github.com/nelson</a>
          </div>
        </div>
      </div>
    </Section>
  )
}

export function PricingSection() {
  const navigate = useNavigate()
  // Adapted from TailwindPlus "Three tiers with emphasized tier" — re-skinned
  // to repo palette (zinc/teal, no indigo) and wired to the central TIERS
  // catalog + /checkout flow. The CSS-only monthly/annual toggle uses
  // `group/tiers` + `group-not-has-[...]:hidden` so the two price lines swap
  // without any JS state.
  return (
    <Section id="pricing" className="border-t border-white/5">
      <form className="group/tiers mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <KineticText as="h2" text="Free until it's worth paying for." className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
          <p className="mx-auto mt-5 max-w-xl text-pretty text-sm text-zinc-400 md:text-base">
            Pick a tier that matches how often you ship. Switch or cancel any
            time — we prorate down to the day.
          </p>
        </div>

        {/* Monthly / Annual frequency toggle (radio-driven, no JS) */}
        <div className="mt-10 flex justify-center">
          <fieldset aria-label="Billing frequency">
            <div className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center font-mono text-[11px] uppercase tracking-widest inset-ring inset-ring-white/10">
              <label className="group relative cursor-pointer rounded-full px-4 py-1.5 has-checked:bg-teal-500">
                <input
                  defaultValue="monthly"
                  defaultChecked
                  name="frequency"
                  type="radio"
                  className="absolute inset-0 appearance-none rounded-full"
                />
                <span className="text-zinc-400 group-has-checked:text-zinc-950">
                  Monthly
                </span>
              </label>
              <label className="group relative cursor-pointer rounded-full px-4 py-1.5 has-checked:bg-teal-500">
                <input
                  defaultValue="annually"
                  name="frequency"
                  type="radio"
                  className="absolute inset-0 appearance-none rounded-full"
                />
                <span className="text-zinc-400 group-has-checked:text-zinc-950">
                  Annually
                </span>
              </label>
            </div>
          </fieldset>
        </div>

        {/* Tier cards */}
        <div className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-6 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {TIERS.map((t) => (
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

              {t.free ? (
                <p className="mt-6 text-4xl font-semibold tracking-tight text-white">
                  Free
                </p>
              ) : (
                <>
                  <p className="mt-6 flex items-baseline gap-x-1 group-not-has-[[name=frequency][value=monthly]:checked]/tiers:hidden">
                    <span className="text-4xl font-semibold tracking-tight text-white">
                      ${t.priceMonthly}
                    </span>
                    <span className="text-sm/6 font-semibold text-zinc-500">
                      /month
                    </span>
                  </p>
                  <p className="mt-6 flex items-baseline gap-x-1 group-not-has-[[name=frequency][value=annually]:checked]/tiers:hidden">
                    <span className="text-4xl font-semibold tracking-tight text-white">
                      ${t.priceAnnual}
                    </span>
                    <span className="text-sm/6 font-semibold text-zinc-500">
                      /year
                    </span>
                  </p>
                </>
              )}

              <MagneticButton
                primary={t.highlighted}
                className="mt-7 w-full"
                onClick={() =>
                  t.free
                    ? navigate({ to: '/sign-in' })
                    : navigate({
                        to: '/checkout/$tier',
                        // `t.free` short-circuited above — t.id is guaranteed
                        // to be 'pro' | 'premium' here, but TS can't narrow.
                        params: { tier: t.id as 'pro' | 'premium' },
                      })
                }
              >
                {t.cta}
              </MagneticButton>

              <ul className="mt-8 space-y-3 text-sm/6 text-zinc-300 xl:mt-10">
                {t.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <span
                      aria-hidden="true"
                      className={
                        t.highlighted
                          ? 'mt-0.5 text-teal-400'
                          : 'mt-0.5 text-zinc-500'
                      }
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
      </form>
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
