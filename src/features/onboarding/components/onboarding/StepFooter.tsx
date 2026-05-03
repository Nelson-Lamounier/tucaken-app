// src/features/onboarding/components/StepFooter.tsx
//
// Bottom action row for steps 2-4. Skip is given equal visual weight to Next
// per the spec — with a small reassurance note about doing it later.

import { ArrowRight } from 'lucide-react'

interface Props {
  /** Reassurance shown next to Skip. Omit to hide the Skip button entirely. */
  skipNote?: string
  onSkip?: () => void
  onNext: () => void
  /** When true, Next is shown as the primary CTA but disabled. */
  nextDisabled?: boolean
  nextLabel?: string
  /** When true, shows a subtle "Back" link on the left edge. */
  onBack?: () => void
}

export function StepFooter({
  skipNote,
  onSkip,
  onNext,
  nextDisabled,
  nextLabel = 'Next',
  onBack,
}: Props) {
  return (
    <div className="mt-8 flex flex-col gap-3 border-t border-white/5 pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md px-2.5 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            ← Back
          </button>
        )}

        {onSkip && skipNote && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              Skip for now
            </button>
            <span className="text-[11px] text-zinc-500">{skipNote}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-teal-500 px-5 py-2 text-xs font-semibold text-zinc-950 shadow-[0_8px_30px_-12px_rgba(20,184,166,0.6)] transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-zinc-500 disabled:shadow-none"
      >
        {nextLabel}
        <ArrowRight className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  )
}
