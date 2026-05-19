// src/features/onboarding/components/steps/DistillStep.tsx
//
// Onboarding distillation step — shows resume-ready project cards extracted
// from the user's connected repos. The user can toggle which projects to
// include in their resume before continuing to the Review step.

import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { selectDistillableRepos } from '@/features/github/lib/distill'
import { DistillationCard } from '@/features/github/components/DistillationCard'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { StepFooter } from '@/features/onboarding/components/onboarding/StepFooter'

interface Props {
  readonly onNext: () => void
  readonly onBack: () => void
}

export function DistillStep({ onNext, onBack }: Props) {
  const { data } = useGitHubConnectedRepos()
  const cards = selectDistillableRepos(data ?? [])

  return (
    <div className="flex flex-1 flex-col">
      <StepHeader
        title="Your projects, resume-ready"
        sub="We distilled each project into resume-ready bullets. Toggle the ones to use."
      />

      {cards.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          No resume-ready projects yet — connect more repos or re-index.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((r) => (
            <DistillationCard key={r.repoFullName} repo={r} />
          ))}
        </div>
      )}

      <div className="mt-auto">
        <StepFooter onBack={onBack} onNext={onNext} nextLabel="Continue" />
      </div>
    </div>
  )
}
