'use client'

import { useQuery } from '@tanstack/react-query'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { Card } from '@/components/ui/Card'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { useProfileSummary } from '@/features/profile/hooks/use-profile-summary'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'
import { listResumeImportsFn, listCareerEntriesFn } from '@/server/resume-imports'
import { AnimatedTabs } from '@/components/ui/AnimatedTabs'
import { MirrorPanel } from '@/features/profile/components/MirrorPanel'
import { DirectionPanel } from '@/features/profile/components/DirectionPanel'
import { ReconciliationPanel } from '@/features/profile/components/ReconciliationPanel'
import { KbScorePanel } from './KbScorePanel'
import { KbOverviewPanel } from './KbOverviewPanel'
import { RepoBreakdownPanel } from './RepoBreakdownPanel'
import { ActivityPanel } from './ActivityPanel'
import { KbSetupChecklist } from './KbSetupChecklist'
import { KbActivityFeed } from './KbActivityFeed'
import { RepoProfileCards } from './RepoProfileCards'
import { CareerDataBreakdown } from './CareerDataBreakdown'
import { ResumeFilesList } from './ResumeFilesList'
import { KbQuickActions } from './KbQuickActions'
import { PanelStack } from './PanelStack'
import { PanelGrid } from './PanelGrid'
import { SplitLayout } from './SplitLayout'
import { WelcomeSummary } from './WelcomeSummary'
import { projectsQueries } from '@/features/projects/server/queries'
import { partitionProjects } from '@/features/projects/lib/classify'
import { deriveKbStats } from '../lib/kb-stats'
import { deriveDashboardSummary } from '../lib/dashboard-summary'

export function UserDashboard() {
  const { data: repos = [], isLoading: loadingRepos } = useGitHubConnectedRepos()
  const { data: profileSummary } = useProfileSummary()
  const { data: me } = useQuery({ queryKey: adminKeys.me.detail(), queryFn: getMeFn })
  const isAdmin = me?.plan.role === 'admin'

  const { data: imports = [], isLoading: loadingImports } = useQuery({
    queryKey: adminKeys.resumeImports.list(),
    queryFn:  () => listResumeImportsFn(),
  })

  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: adminKeys.resumeImports.entries(),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
  })

  const { data: projectList } = useQuery(
    projectsQueries.list({ limit: 100, offset: 0, includeArchived: false }),
  )

  const isLoading    = loadingRepos || loadingImports || loadingEntries
  const stats        = deriveKbStats(repos, entries, imports)
  const latestImport = imports[0]
  const hasProject   = partitionProjects(projectList?.items ?? []).curated.length > 0
  const summary      = deriveDashboardSummary({
    name:    me?.name,
    email:   me?.email,
    stats,
    hasProject,
    mirror:  profileSummary?.mirror?.paragraph ?? null,
  })

  return (
    <DashboardPage
      title="Knowledge Base"
      description="Your AI agent's data health at a glance."
    >
      <div className="space-y-8">
        {/* X — Large / full-width band. Every user gets the same first row:
            greeting + activity. Admins additionally see a compact
            Resume-Readiness beside Activity — the one panel that distinguishes
            the admin view. (The diagnostic is not yet trustworthy for end users
            — lossy-rollup false negatives — so it stays admin-only for now.) */}
        <PanelStack>
          <WelcomeSummary summary={summary} />
          {isAdmin ? (
            <SplitLayout
              stretch
              asideWidth={380}
              main={<ActivityPanel />}
              aside={
                <KbScorePanel
                  compact
                  diagnostic={profileSummary?.diagnostic ?? null}
                  isLoading={isLoading}
                />
              }
            />
          ) : (
            <ActivityPanel />
          )}
        </PanelStack>

        {/* Main reading column (left) + small sidebar rail (right). The overview
            row sits at the top of the main column so it shares Profile
            Intelligence's width; the sidebar runs alongside it. */}
        <SplitLayout
          main={
            <PanelStack>
              {/* Y — Medium / equal-height card grid (all users). */}
              <PanelGrid min={300}>
                <RepoBreakdownPanel />
                <CareerDataBreakdown
                  entries={entries}
                  latestImport={latestImport}
                  isLoading={loadingEntries || loadingImports}
                />
              </PanelGrid>
              {profileSummary && (
                <Card as="section" className="flex flex-col overflow-hidden">
                  <div className="flex items-center border-b border-zinc-200 px-6 py-4 dark:border-white/5">
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Profile Intelligence</h3>
                  </div>
                  <AnimatedTabs
                    bare
                    items={[
                      {
                        id: 'mirror',
                        title: 'Profile mirror',
                        content: <MirrorPanel summary={profileSummary} />,
                      },
                      {
                        id: 'direction',
                        title: 'Career direction',
                        content: <DirectionPanel summary={profileSummary} />,
                      },
                      {
                        id: 'reconciliation',
                        title: 'Résumé reconciliation',
                        content: (
                          <ReconciliationPanel summary={profileSummary} hasResume={entries.length > 0} />
                        ),
                      },
                    ]}
                  />
                </Card>
              )}
              <RepoProfileCards repos={repos} isLoading={loadingRepos} />
            </PanelStack>
          }
          aside={
            /* Z — Small / sidebar list. Add a small, compact widget here; the
               list grows downward. */
            <PanelStack>
              <KbOverviewPanel stats={stats} />
              <ResumeFilesList imports={imports} isLoading={loadingImports} />
              <KbSetupChecklist stats={stats} hasProject={hasProject} />
              <KbActivityFeed imports={imports} repos={repos} />
            </PanelStack>
          }
        />

        <KbQuickActions />
      </div>
    </DashboardPage>
  )
}
