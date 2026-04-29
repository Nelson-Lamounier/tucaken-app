import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { GitHubAccountSection } from '@/features/github/components/GitHubAccountSection'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { handleGitHubInstallFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'

const searchSchema = z.object({
  installation_id: z.string().optional(),
  setup_action: z.string().optional(),
})

export const Route = createFileRoute('/_dashboard/settings/github')({
  validateSearch: searchSchema,
  component: GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { installation_id } = Route.useSearch()

  const { data: installation, isLoading } = useGitHubInstallation()
  const { data: accessibleRepos, isLoading: isLoadingRepos } = useGitHubAccessibleRepos(
    Boolean(installation),
  )
  const { data: connectedRepos } = useGitHubConnectedRepos()

  useEffect(() => {
    if (!installation_id) return

    void (async () => {
      try {
        await handleGitHubInstallFn({ data: { installationId: installation_id } })
      } catch {
        // Installation may already exist — invalidate regardless
      } finally {
        await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
        void navigate({ to: '/settings/github', replace: true, search: {} })
      }
    })()
  }, [installation_id, navigate, queryClient])

  return (
    <DashboardPage
      title="GitHub"
      description="Connect your GitHub account to index repositories into the knowledge base."
    >
      <div className="max-w-2xl space-y-4">
        <GitHubAccountSection installation={installation} isLoading={isLoading} />
        {installation && (
          <GitHubRepoPicker
            accessibleRepos={accessibleRepos}
            isLoading={isLoadingRepos}
            connectedRepos={connectedRepos}
          />
        )}
        {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
      </div>
    </DashboardPage>
  )
}
