// src/features/onboarding/components/PortfolioStep.tsx
//
// Step 2 — paste a portfolio URL. Validates with zod, shows a live
// preview card once a valid URL is entered.

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Globe, Check } from 'lucide-react'
import { COPY } from './content'
import { portfolioUrlSchema } from './validation'
import { StepHeader } from './StepHeader'
import { StepFooter } from './StepFooter'

interface Props {
  initialValue?: string
  onSubmit: (url: string) => Promise<void> | void
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

export function PortfolioStep({ initialValue = '', onSubmit, onNext, onSkip, onBack }: Readonly<Props>) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [normalized, setNormalized] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Form reveals only after the StepHeader typewriter finishes.
  const [introDone, setIntroDone] = useState(false)

  function validate(raw: string) {
    if (!raw.trim()) {
      setNormalized(null)
      setError(null)
      return null
    }
    const parsed = portfolioUrlSchema.safeParse(raw)
    if (parsed.success) {
      setError(null)
      setNormalized(parsed.data)
      return parsed.data
    }
    setError(parsed.error.issues[0]?.message ?? 'Invalid URL.')
    setNormalized(null)
    return null
  }

  async function handleNext() {
    const url = validate(value)
    if (!url) return
    setSubmitting(true)
    try {
      await onSubmit(url)
      onNext()
    } finally {
      setSubmitting(false)
    }
  }

  const host = normalized ? safeHost(normalized) : null

  return (
    <div className="flex flex-1 flex-col">
      <StepHeader
        eyebrow={COPY.portfolio.eyebrow}
        title={COPY.portfolio.title}
        sub={COPY.portfolio.sub}
        typewriter
        onTypingComplete={() => setIntroDone(true)}
      />

      <AnimatePresence>
        {introDone && (
          <motion.div
            key="portfolio-form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}
            className="mx-auto w-full max-w-sm space-y-3"
          >
            <label className="block">
              <span className="sr-only">Portfolio URL</span>
              {/* Gradient border: gradient bg + 1px padding wrapping the field */}
              <div
                className={[
                  'rounded-xl bg-linear-to-r p-px transition-[background] duration-300',
                  error
                    ? 'from-rose-400/70 via-rose-300/40 to-rose-400/70'
                    : 'from-teal-400/70 via-emerald-400/50 to-cyan-400/70',
                ].join(' ')}
              >
                <div className="flex items-center gap-2.5 rounded-[11px] bg-zinc-950 px-4 py-4">
                  <Globe className="size-5 shrink-0 text-zinc-500" strokeWidth={1.75} />
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value)
                      validate(e.target.value)
                    }}
                    onBlur={(e) => validate(e.target.value)}
                    placeholder={COPY.portfolio.placeholder}
                    className="w-full bg-transparent text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                  />
                  {normalized && (
                    <Check className="size-5 shrink-0 text-teal-400" strokeWidth={2.5} />
                  )}
                </div>
              </div>
            </label>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-xs text-rose-300"
              >
                {error}
              </motion.p>
            )}

            <AnimatePresence>
              {normalized && host && (
                <motion.div
                  initial={{ opacity: 0, y: 8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 flex items-start gap-3 rounded-lg border border-white/10 bg-white/2 p-3.5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-md bg-linear-to-br from-teal-400/20 to-emerald-500/20 text-sm font-semibold text-teal-200 ring-1 ring-teal-400/20">
                      {host[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-100">{host}</div>
                      <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                        We&apos;ll fetch metadata when you connect — never your private content.
                      </div>
                    </div>
                    <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-200 ring-1 ring-teal-400/30">
                      Ready
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto">
        <StepFooter
          onBack={onBack}
          skipNote={COPY.portfolio.skipNote}
          onSkip={onSkip}
          onNext={handleNext}
          nextDisabled={!normalized || submitting}
          nextLabel={submitting ? 'Saving…' : 'Next'}
        />
      </div>
    </div>
  )
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
