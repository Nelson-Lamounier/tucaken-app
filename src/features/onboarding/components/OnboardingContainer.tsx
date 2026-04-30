import { MultiColumnLayout } from '@/components/ui/MultiColumnLayout'
import { OnboardingSidebar } from './OnboardingSidebar'
import { ImportCareerStep } from './steps/ImportCareerStep'
import { ConnectReposStep } from './steps/ConnectReposStep'
import { GenerateResumeStep } from './steps/GenerateResumeStep'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

export type OnboardingStep = 1 | 2 | 3

interface OnboardingContainerProps {
  readonly activeStep: OnboardingStep
  readonly onStepChange: (step: OnboardingStep) => void
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoadingInstallation: boolean
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoadingRepos: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
}

export function OnboardingContainer({
  activeStep,
  onStepChange,
  installation,
  isLoadingInstallation,
  accessibleRepos,
  isLoadingRepos,
  connectedRepos,
}: OnboardingContainerProps) {
  return (
    <MultiColumnLayout secondaryColumn={<OnboardingSidebar activeStep={activeStep} />}>
      {activeStep === 1 && (
        <ImportCareerStep
          onNext={() => onStepChange(2)}
          onSkip={() => onStepChange(2)}
        />
      )}
      {activeStep === 2 && (
        <ConnectReposStep
          installation={installation}
          isLoadingInstallation={isLoadingInstallation}
          accessibleRepos={accessibleRepos}
          isLoadingRepos={isLoadingRepos}
          connectedRepos={connectedRepos}
          onNext={() => onStepChange(3)}
        />
      )}
      {activeStep === 3 && (
        <GenerateResumeStep />
      )}
    </MultiColumnLayout>
  )
}
