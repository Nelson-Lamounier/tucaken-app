// src/features/onboarding/components/steps/MirrorStep.tsx
//
// Onboarding mirror step — shows the AI-generated profile summary so the
// user can see how Tucaken has understood their professional story before
// continuing to the Distill step.

import { useProfileSummary } from '@/features/profile/hooks/use-profile-summary'
import { MirrorPanel } from '@/features/profile/components/MirrorPanel'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { StepFooter } from '@/features/onboarding/components/onboarding/StepFooter'

interface Props {
  readonly onNext: () => void
  readonly onBack: () => void
}

export function MirrorStep({ onNext, onBack }: Props) {
  const { data } = useProfileSummary()

  return (
    <div className="flex flex-1 flex-col">
      <StepHeader
        title="This is you, distilled"
        sub="Here's how Tucaken reads your professional story so far."
      />

      {data ? (
        <MirrorPanel summary={data} />
      ) : (
        <p className="py-10 text-center text-sm text-zinc-500">Building your profile…</p>
      )}

      <div className="mt-auto">
        <StepFooter onBack={onBack} onNext={onNext} nextLabel="Continue" />
      </div>
    </div>
  )
}
