import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { GitBranch, FileText, Plus } from 'lucide-react'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ImportCareerStep } from '@/features/onboarding/components/steps/ImportCareerStep'
import { GitHubAccountSection } from '@/features/github/components/GitHubAccountSection'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { getResumesFn } from '@/server/resumes'
import { handleGitHubInstallFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'
import { Button } from '@/components/ui/Button'

type Tab = 'repositories' | 'resumes'

const searchSchema = z.object({
  installation_id: z.coerce.string().optional(),
  setup_action:    z.coerce.string().optional(),
  tab:             z.enum(['repositories', 'resumes']).default('repositories'),
})

export const Route = createFileRoute('/_dashboard/settings/github')({
  validateSearch: searchSchema,
  component:      DatabaseSettingsPage,
})

function DatabaseSettingsPage() {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const { installation_id, tab } = Route.useSearch()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab]       = useState<Tab>(tab)
  const [addingResume, setAddingResume] = useState(false)

  const { data: installation, isLoading: isLoadingInstallation } = useGitHubInstallation()
  const { data: accessibleRepos, isLoading: isLoadingRepos }     = useGitHubAccessibleRepos(Boolean(installation))
  const { data: connectedRepos }                                  = useGitHubConnectedRepos()
  const { data: resumes }                                         = useQuery({
    queryKey: adminKeys.resumes.list(),
    queryFn:  () => getResumesFn(),
  })

  useEffect(() => {
    if (!installation_id) return
    const id = installation_id
    async function handleInstall() {
      try {
        await handleGitHubInstallFn({ data: { installationId: id } })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'GitHub installation failed'
        addToast('error', `GitHub connect failed: ${msg}`)
      } finally {
        await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
        void navigate({ to: '/settings/github', replace: true, search: { tab: 'repositories' } })
      }
    }
    void handleInstall()
  }, [installation_id, navigate, queryClient, addToast])

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'repositories', label: 'Repositories', icon: <GitBranch className="size-4" /> },
    { id: 'resumes',      label: 'Resumes',       icon: <FileText className="size-4" /> },
  ]

  return (
    <DashboardPage
      title="Database"
      description="Manage the repositories and resumes that seed your knowledge base."
      fullWidth
    >
      {/* Tab bar */}
      <div className="border-b border-white/10">
        <nav className="flex gap-1 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === t.id
                  ? 'border-teal-400 text-teal-300'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'repositories' && (
          <div className="max-w-3xl space-y-6">
            <GitHubAccountSection installation={installation} isLoading={isLoadingInstallation} />
            {installation && (
              <GitHubRepoPicker
                accessibleRepos={accessibleRepos}
                isLoading={isLoadingRepos}
                connectedRepos={connectedRepos}
              />
            )}
            {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
          </div>
        )}

        {activeTab === 'resumes' && (
          <div className="max-w-3xl space-y-6">
            {addingResume ? (
              <div>
                <button
                  type="button"
                  onClick={() => setAddingResume(false)}
                  className="mb-4 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  ← Back to resumes
                </button>
                <ImportCareerStep
                  onNext={() => setAddingResume(false)}
                  onSkip={() => setAddingResume(false)}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-100">Uploaded resumes</h3>
                  <Button
                    variant="secondary"
                    onClick={() => setAddingResume(true)}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Plus className="size-3.5" />
                    Add resume
                  </Button>
                </div>

                {resumes && resumes.length > 0 ? (
                  <ul className="divide-y divide-white/6 rounded-xl border border-white/10">
                    {resumes.map((r) => (
                      <li key={r.resumeId} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm text-zinc-200">{r.label}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {new Date(r.createdAt).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </p>
                        </div>
                        {r.isActive && (
                          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-300 ring-1 ring-inset ring-teal-400/25">
                            Active
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
                    <FileText className="mx-auto mb-3 size-8 text-zinc-700" />
                    <p className="text-sm text-zinc-500">No resumes uploaded yet</p>
                    <button
                      type="button"
                      onClick={() => setAddingResume(true)}
                      className="mt-2 text-xs text-teal-400 transition-colors hover:text-teal-300"
                    >
                      Upload your first resume →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardPage>
  )
}
