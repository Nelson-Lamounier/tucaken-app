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

export function PortfolioStep({ initialValue = '', onSubmit, onNext, onSkip, onBack }: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [normalized, setNormalized] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
    <div className="flex h-full flex-col">
      <StepHeader
        eyebrow={COPY.portfolio.eyebrow}
        title={COPY.portfolio.title}
        sub={COPY.portfolio.sub}
      />

      <div className="space-y-3">
        <label className="block">
          <span className="sr-only">Portfolio URL</span>
          <div
            className={[
              'flex items-center gap-2 rounded-lg border bg-white/[0.02] px-3.5 py-2.5 transition',
              error
                ? 'border-rose-400/40 bg-rose-500/[0.04]'
                : normalized
                  ? 'border-teal-400/40 bg-teal-500/[0.04]'
                  : 'border-white/10 focus-within:border-teal-400/40',
            ].join(' ')}
          >
            <Globe className="size-4 shrink-0 text-zinc-500" strokeWidth={1.75} />
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
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
            {normalized && <Check className="size-4 shrink-0 text-teal-400" strokeWidth={2.5} />}
          </div>
        </label>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-rose-300"
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
              <div className="mt-2 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3.5">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-teal-400/20 to-emerald-500/20 text-sm font-semibold text-teal-200 ring-1 ring-teal-400/20">
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
      </div>

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
