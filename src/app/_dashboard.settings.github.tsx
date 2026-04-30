import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { FullWidthBar, type FullWidthBarStep } from '@/components/ui/FullWidthBar'
import { OnboardingContainer, type OnboardingStep } from '@/features/onboarding/components/OnboardingContainer'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { handleGitHubInstallFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'

const searchSchema = z.object({
  installation_id: z.coerce.string().optional(),
  setup_action:    z.coerce.string().optional(),
  step:            z.coerce.number().min(1).max(3).catch(1),
})

export const Route = createFileRoute('/_dashboard/settings/github')({
  validateSearch: searchSchema,
  component:      GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const navigate        = useNavigate()
  const queryClient     = useQueryClient()
  const { installation_id, step } = Route.useSearch()

  const activeStep = (step as OnboardingStep) ?? 1

  const { addToast } = useToastStore()

  const { data: installation, isLoading: isLoadingInstallation } = useGitHubInstallation()
  const { data: accessibleRepos, isLoading: isLoadingRepos }     = useGitHubAccessibleRepos(Boolean(installation))
  const { data: connectedRepos }                                  = useGitHubConnectedRepos()

  useEffect(() => {
    if (!installation_id) return

    void (async () => {
      try {
        await handleGitHubInstallFn({ data: { installationId: installation_id } })
      } catch (err) {
        // Existing installation or config error — surface it so it's not silent
        const msg = err instanceof Error ? err.message : 'GitHub installation failed'
        console.error('[github] installation callback error:', msg)
        addToast('error', `GitHub connect failed: ${msg}`)
      } finally {
        await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
        void navigate({ to: '/settings/github', replace: true, search: { step: 2 } })
      }
    })()
  }, [installation_id, navigate, queryClient, addToast])

  function handleStepChange(next: OnboardingStep) {
    void navigate({ to: '/settings/github', search: { step: next } })
  }

  const steps: FullWidthBarStep[] = [
    {
      name:    'Import Career',
      current: activeStep === 1,
      onClick: () => handleStepChange(1),
    },
    {
      name:    'Connect Repos',
      current: activeStep === 2,
      onClick: () => handleStepChange(2),
    },
    {
      name:    'Generate Resume',
      current: activeStep === 3,
      onClick: () => handleStepChange(3),
    },
  ]

  return (
    <DashboardPage
      title="GitHub"
      description="Set up your career history, connect repositories, and generate your first tailored resume."
      fullWidth={true}
      headerBottom={<FullWidthBar steps={steps} />}
    >
      <OnboardingContainer
        activeStep={activeStep}
        onStepChange={handleStepChange}
        installation={installation}
        isLoadingInstallation={isLoadingInstallation}
        accessibleRepos={accessibleRepos}
        isLoadingRepos={isLoadingRepos}
        connectedRepos={connectedRepos}
      />
    </DashboardPage>
  )
}
