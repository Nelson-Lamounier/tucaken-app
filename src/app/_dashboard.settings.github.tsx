import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { GitBranch, FileText, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ImportCareerStep } from '@/features/onboarding/components/steps/ImportCareerStep'
import { GitHubAccountSection } from '@/features/github/components/GitHubAccountSection'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { getResumesFn } from '@/server/resumes'
import { listResumeImportsFn } from '@/server/resume-imports'
import { handleGitHubInstallFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'
import { Button } from '@/components/ui/Button'

type Tab = 'repositories' | 'resumes'

const searchSchema = z.object({
  installation_id: z.coerce.string().optional(),
  // GitHub appends setup_action=install automatically — accepted but not used.
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

  const [addingResume, setAddingResume] = useState(false)

  const { data: installation, isLoading: isLoadingInstallation } = useGitHubInstallation()
  const { data: accessibleRepos, isLoading: isLoadingRepos }     = useGitHubAccessibleRepos(Boolean(installation))
  const { data: connectedRepos }                                  = useGitHubConnectedRepos()
  const { data: resumes }                                         = useQuery({
    queryKey: adminKeys.resumes.list(),
    queryFn:  () => getResumesFn(),
  })
  const { data: resumeImports = [] }                              = useQuery({
    queryKey: adminKeys.resumeImports.list(),
    queryFn:  () => listResumeImportsFn(),
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
        // If the install was triggered from onboarding, return there (repos step).
        // GitHub's App Setup URL is fixed to /settings/github, so we coordinate
        // the return destination via localStorage.
        const returnTo = localStorage.getItem('github_install_return')
        localStorage.removeItem('github_install_return')
        if (returnTo === 'onboarding') {
          void navigate({ to: '/onboarding', replace: true, search: { step: 4 } })
        } else {
          void navigate({ to: '/settings/github', replace: true, search: { tab: 'repositories' } })
        }
      }
    }
    void handleInstall()
  }, [installation_id, navigate, queryClient, addToast])

  // Suppress page content while handling a GitHub App install callback to avoid
  // a content flash before the redirect fires.
  if (installation_id) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        Connecting GitHub…
      </div>
    )
  }

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
              onClick={() => void navigate({ to: '/settings/github', search: { tab: t.id }, replace: true })}
              className={[
                'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                tab === t.id
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
        {tab === 'repositories' && (
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

        {tab === 'resumes' && (
          <div className="max-w-3xl space-y-8">
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
              <>
                {/* ── Uploaded PDF files (import history) ── */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Uploaded files</h3>
                      <p className="mt-0.5 text-xs text-zinc-500">PDFs processed to seed your career knowledge base</p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setAddingResume(true)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Plus className="size-3.5" />
                      Upload resume
                    </Button>
                  </div>

                  {resumeImports.length > 0 ? (
                    <ul className="divide-y divide-white/6 rounded-xl border border-white/10">
                      {resumeImports.map((imp) => {
                        const isOk      = imp.status === 'completed' || imp.status === 'ready_for_review'
                        const isFailed  = imp.status === 'failed'
                        const isPending = !isOk && !isFailed
                        return (
                          <li key={imp.id} className="flex items-center gap-3 px-4 py-3">
                            {isOk     && <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />}
                            {isFailed && <AlertCircle  className="size-4 shrink-0 text-red-400" />}
                            {isPending && <Loader2     className="size-4 shrink-0 animate-spin text-indigo-400" />}
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-sm text-zinc-200">{imp.originalFilename}</p>
                              <p className="mt-0.5 text-xs text-zinc-500">
                                {new Date(imp.createdAt).toLocaleDateString('en-GB', {
                                  day: 'numeric', month: 'short', year: 'numeric',
                                })}
                                {imp.careerEntriesCreated.length > 0 && (
                                  <> · {imp.careerEntriesCreated.length} entries extracted</>
                                )}
                              </p>
                            </div>
                            <span className={[
                              'rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                              isOk      ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25'
                              : isFailed ? 'bg-red-500/15 text-red-300 ring-red-400/25'
                              : 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/25',
                            ].join(' ')}>
                              {isOk ? 'Processed' : isFailed ? 'Failed' : 'Processing'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
                      <FileText className="mx-auto mb-3 size-8 text-zinc-700" />
                      <p className="text-sm text-zinc-500">No resume files uploaded yet</p>
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

                {/* ── Resume templates (used for applications) ── */}
                {resumes && resumes.length > 0 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Resume templates</h3>
                      <p className="mt-0.5 text-xs text-zinc-500">Structured resumes used when applying to jobs</p>
                    </div>
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
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </DashboardPage>
  )
}
