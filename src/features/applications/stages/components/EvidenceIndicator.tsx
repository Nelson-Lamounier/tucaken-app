import { TONE, type Tone } from '@/components/ui/tone'
import type { EvidenceStrength } from '../types/workspace'

const STRENGTH_TO_TONE: Record<EvidenceStrength, Tone> = {
  strong: 'good',
  moderate: 'warn',
  none: 'bad',
}

const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  strong: 'Strong evidence',
  moderate: 'Some evidence',
  none: 'Gap',
}

/**
 * Traffic-light strength of Evidence for a topic. Colour is supplemental — the
 * textual label is always present, so the signal is never colour-only.
 * Built on the dual-mode semantic tones in src/components/ui/tone.ts.
 */
export function EvidenceIndicator({ strength }: { readonly strength: EvidenceStrength }) {
  const tone = STRENGTH_TO_TONE[strength]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone].chip}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {STRENGTH_LABEL[strength]}
    </span>
  )
}
