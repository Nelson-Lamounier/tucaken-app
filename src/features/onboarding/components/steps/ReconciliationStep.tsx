// src/features/onboarding/components/steps/ReconciliationStep.tsx
//
// Onboarding reconciliation step — compares the user's résumé against
// the AI-inferred reality before continuing to the Distill step.

import { useProfileSummary } from '@/features/profile/hooks/use-profile-summary'
import { ReconciliationPanel } from '@/features/profile/components/ReconciliationPanel'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { StepFooter } from '@/features/onboarding/components/onboarding/StepFooter'

interface Props {
  readonly onNext: () => void
  readonly onBack: () => void
}

export function ReconciliationStep({ onNext, onBack }: Props) {
  const { data } = useProfileSummary()

  return (
    <div className="flex flex-1 flex-col">
      <StepHeader
        title="Résumé vs. reality"
        sub="Here's how your résumé lines up with what Tucaken sees in your work."
      />

      {data ? (
        <ReconciliationPanel summary={data} />
      ) : (
        <p className="py-10 text-center text-sm text-zinc-500">Reconciling your résumé…</p>
      )}

      <div className="mt-auto">
        <StepFooter onBack={onBack} onNext={onNext} nextLabel="Continue" />
      </div>
    </div>
  )
}
