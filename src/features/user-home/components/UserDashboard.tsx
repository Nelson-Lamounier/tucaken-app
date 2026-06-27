'use client'

import { useQuery } from '@tanstack/react-query'
import { DashboardPage } from '@/components/layouts/DashboardPage'
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
import { KbStatsPanel } from './KbStatsPanel'
import { KbSetupChecklist } from './KbSetupChecklist'
import { KbActivityFeed } from './KbActivityFeed'
import { RepoProfileCards } from './RepoProfileCards'
import { CareerDataBreakdown } from './CareerDataBreakdown'
import { ResumeFilesList } from './ResumeFilesList'
import { KbQuickActions } from './KbQuickActions'
import { PanelFlow } from './PanelFlow'
import { deriveKbStats } from '../lib/kb-stats'
import { buildHeroTiles, deriveHeroSparks, deriveHeroMeta } from '../lib/hero-tiles'

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

  const isLoading    = loadingRepos || loadingImports || loadingEntries
  const stats        = deriveKbStats(repos, entries, imports)
  const latestImport = imports[0]
  const heroTiles    = buildHeroTiles(
    isLoading,
    stats,
    deriveHeroSparks(repos, entries, imports),
    deriveHeroMeta(repos, entries, imports),
  )

  return (
    <DashboardPage
      title="Knowledge Base"
      description="Your AI agent's data health at a glance."
    >
      <div className="space-y-8">
        {/* Hero band. The Resume-Readiness diagnostic is not yet trustworthy for
            end users (lossy-rollup false negatives), so it is admin-only until the
            data matures; users see honest KB quality + their own activity instead. */}
        {isAdmin ? (
          <PanelFlow min={300}>
            <KbScorePanel diagnostic={profileSummary?.diagnostic ?? null} isLoading={isLoading} />
            <KbStatsPanel tiles={heroTiles} />
          </PanelFlow>
        ) : (
          <div className="space-y-6">
            <ActivityPanel />
            <PanelFlow min={300}>
              <KbOverviewPanel stats={stats} />
              <RepoBreakdownPanel />
              <CareerDataBreakdown
                entries={entries}
                latestImport={latestImport}
                isLoading={loadingEntries || loadingImports}
              />
            </PanelFlow>
          </div>
        )}

        {/* Main column + health rail */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px] xl:items-start">
          <main className="flex min-w-0 flex-col gap-8">
            {profileSummary && (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Profile Intelligence</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    What your data says about you — expand any panel for the full read
                  </p>
                </div>
                <AnimatedTabs
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
              </section>
            )}
            <RepoProfileCards repos={repos} isLoading={loadingRepos} />
          </main>

          <aside className="flex flex-col gap-6">
            <KbSetupChecklist stats={stats} />
            <ResumeFilesList imports={imports} isLoading={loadingImports} />
            <KbActivityFeed imports={imports} repos={repos} />
          </aside>
        </div>

        <KbQuickActions />
      </div>
    </DashboardPage>
  )
}
