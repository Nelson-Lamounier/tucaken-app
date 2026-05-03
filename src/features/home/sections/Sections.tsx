"use client"
// src/features/home/sections/Sections.tsx
// Re-usable below-the-fold sections (Problem, HowItWorks, Comparison, Founder, Pricing, FAQ, Footer).
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { problems, steps, comparison, founder, pricing, faq } from '../content'

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
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
          You did the work. Your resume doesn't show it.
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {problems.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
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
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">Three steps. No magic.</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
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
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
          What other AI resume tools can't say.
        </h2>
        <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/50">
          <div className="grid grid-cols-12 border-b border-white/10 bg-white/[0.03] font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            <div className="col-span-5 px-5 py-3">You ask</div>
            <div className="col-span-3 border-l border-white/10 px-5 py-3 text-zinc-500">Other tools</div>
            <div className="col-span-4 border-l border-white/10 bg-teal-500/5 px-5 py-3 text-teal-300">Tucaken</div>
          </div>
          {comparison.map((row, i) => (
            <div
              key={i}
              className={['grid grid-cols-12 text-sm', i < comparison.length - 1 ? 'border-b border-white/5' : ''].join(' ')}
            >
              <div className="col-span-5 px-5 py-5 font-medium text-white">{row.q}</div>
              <div className="col-span-3 border-l border-white/10 px-5 py-5 text-zinc-500">{row.o}</div>
              <div className="col-span-4 border-l border-white/10 bg-teal-500/[0.04] px-5 py-5 text-zinc-100">
                <span className="text-teal-400">✓ </span>
                {row.t}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

export function FounderSection() {
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Built by a user, for users</Eyebrow>
        <div className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 p-8 backdrop-blur-md md:p-10">
          <div className="flex items-start gap-5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 font-mono text-lg font-bold text-white">
              N
            </div>
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
  return (
    <Section id="pricing" className="border-t border-white/5">
      <div className="mx-auto max-w-4xl">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
          Free until it's worth paying for.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {pricing.map((p) => (
            <div
              key={p.name}
              className={[
                'relative rounded-2xl border p-6 md:p-8',
                p.hl ? 'border-teal-500/40 bg-gradient-to-br from-teal-500/10 to-emerald-600/5' : 'border-white/10 bg-white/[0.02]',
              ].join(' ')}
            >
              {p.hl && (
                <div className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white">
                  Recommended
                </div>
              )}
              <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">{p.name}</div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-white">{p.price}</span>
                <span className="text-sm text-zinc-500">{p.period}</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-zinc-300">
                    <span className={p.hl ? 'text-teal-400' : 'text-zinc-500'}>✓</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
              <MagneticButton primary={p.hl} className="mt-7 w-full" onClick={() => navigate({ to: '/sign-in' })}>
                {p.cta}
              </MagneticButton>
            </div>
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
              {open === i && <p className="mt-3 text-sm leading-relaxed text-zinc-400">{f.a}</p>}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

export function FooterSection() {
  return (
    <footer className="border-t border-white/5 px-6 py-10 md:px-12">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
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
