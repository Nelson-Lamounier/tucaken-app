// src/features/onboarding/components/steps/DirectionStep.tsx
//
// Onboarding direction step — shows where the user fits based on the
// AI-generated profile summary before continuing to the Distill step.

import { useProfileSummary } from '@/features/profile/hooks/use-profile-summary'
import { DirectionPanel } from '@/features/profile/components/DirectionPanel'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { StepFooter } from '@/features/onboarding/components/onboarding/StepFooter'

interface Props {
  readonly onNext: () => void
  readonly onBack: () => void
}

export function DirectionStep({ onNext, onBack }: Props) {
  const { data } = useProfileSummary()

  return (
    <div className="flex flex-1 flex-col">
      <StepHeader
        title="Where you fit"
        sub="Here's the direction Tucaken sees for your career so far."
      />

      {data ? (
        <DirectionPanel summary={data} />
      ) : (
        <p className="py-10 text-center text-sm text-zinc-500">Working out your direction…</p>
      )}

      <div className="mt-auto">
        <StepFooter onBack={onBack} onNext={onNext} nextLabel="Continue" />
      </div>
    </div>
  )
}
