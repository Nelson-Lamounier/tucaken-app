'use client'

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { Stats } from '@/components/ui/Stats'
import { Button } from '@/components/ui/Button'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { adminKeys } from '@/lib/api/query-keys'
import { listResumeImportsFn, listCareerEntriesFn } from '@/server/resume-imports'
import { KbRepoList } from './KbRepoList'
import { CareerDataBreakdown } from './CareerDataBreakdown'
import { ResumeFilesList } from './ResumeFilesList'
import { KbQuickActions } from './KbQuickActions'
import { deriveKbStats } from '../lib/kb-stats'

export function UserDashboard() {
  const { data: repos = [], isLoading: loadingRepos } = useGitHubConnectedRepos()

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

  let uploadsChangeType: 'positive' | 'negative'
  if (stats.failedImportCount > 0) { uploadsChangeType = 'negative' }
  else                              { uploadsChangeType = 'positive' }

  let kbChangeType: 'positive' | 'negative'
  if (stats.isReady) { kbChangeType = 'positive' }
  else               { kbChangeType = 'negative' }

  let kbValue: string
  if (isLoading)          { kbValue = '…' }
  else if (stats.isReady) { kbValue = 'Ready' }
  else                    { kbValue = 'Needs setup' }

  let kbChange: string
  if (isLoading)          { kbChange = '' }
  else if (stats.isReady) { kbChange = 'AI agent has data to work with' }
  else                    { kbChange = 'Upload a resume or connect a repo' }

  const heroStats = [
    {
      name: 'Connected Repositories',
      value: isLoading ? '…' : stats.repoCount.toString(),
      change: isLoading ? '' : `${stats.syncedRepoCount} synced · ${stats.pendingRepoCount} pending`,
      changeType: 'positive' as const,
    },
    {
      name: 'Career Entries',
      value: isLoading ? '…' : stats.careerEntryCount.toString(),
      change: isLoading
        ? ''
        : `${stats.experienceCount} experience · ${stats.educationCount} education · ${stats.skillCount} skills`,
      changeType: 'positive' as const,
    },
    {
      name: 'Resume Uploads',
      value: isLoading ? '…' : stats.importCount.toString(),
      change: isLoading ? '' : `${stats.processedImportCount} processed · ${stats.failedImportCount} failed`,
      changeType: uploadsChangeType,
    },
    {
      name: 'Knowledge Base',
      value: kbValue,
      change: kbChange,
      changeType: kbChangeType,
    },
  ]

  return (
    <DashboardPage
      title="Knowledge Base"
      description="Your AI agent's data health at a glance."
      actions={
        <Link to="/ai-agent">
          <Button variant="primary">Run AI Agent</Button>
        </Link>
      }
    >
      <div className="space-y-8">
        <Stats stats={heroStats} />
        <KbRepoList repos={repos} isLoading={loadingRepos} />
        <CareerDataBreakdown
          entries={entries}
          latestImport={latestImport}
          isLoading={loadingEntries || loadingImports}
        />
        <ResumeFilesList imports={imports} isLoading={loadingImports} />
        <KbQuickActions />
      </div>
    </DashboardPage>
  )
}
