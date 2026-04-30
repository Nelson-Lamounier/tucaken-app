import { ProgressBar, type ProgressStep, type ProgressStepStatus } from '@/components/ui/ProgressBar'

type OnboardingStep = 1 | 2 | 3

interface OnboardingSidebarProps {
  readonly activeStep: OnboardingStep
}

function stepStatus(stepIdx: number, activeStep: OnboardingStep): ProgressStepStatus {
  if (stepIdx < activeStep) return 'complete'
  if (stepIdx === activeStep) return 'current'
  return 'upcoming'
}

export function OnboardingSidebar({ activeStep }: OnboardingSidebarProps) {
  const steps: ProgressStep[] = [
    {
      name: 'Import Career',
      description: 'Upload resume — extract employment history and education',
      status: stepStatus(1, activeStep),
    },
    {
      name: 'Connect Repos',
      description: 'Index GitHub repos into the Bedrock knowledge base',
      status: stepStatus(2, activeStep),
    },
    {
      name: 'Generate Resume',
      description: 'Paste a job description — get a tailored, evidence-backed resume',
      status: stepStatus(3, activeStep),
    },
  ]

  const heading =
    activeStep === 1
      ? 'Setup Progress'
      : activeStep === 2
      ? 'Connect your GitHub'
      : 'Almost there'

  const description =
    activeStep === 1
      ? 'Import your career history to ground your resumes in real experience. Step 1 is optional.'
      : activeStep === 2
      ? 'Tucaken indexes your repositories so resumes reference actual commits and pull requests.'
      : 'Paste a job description on the left and Tucaken generates a tailored resume grounded in your code and career history.'

  return (
    <div className="p-2">
      <h3 className="mb-1 text-sm font-medium text-zinc-300">{heading}</h3>
      <p className="mb-6 text-xs leading-relaxed text-zinc-500">{description}</p>
      <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Onboarding Flow
      </h4>
      <ProgressBar steps={steps} />
    </div>
  )
}
