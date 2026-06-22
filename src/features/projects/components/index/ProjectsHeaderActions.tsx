import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ClipboardCheck, FolderPlus, Github, Wand2 } from 'lucide-react'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'
import { projectsQueries } from '../../server/queries'
import { partitionProjects } from '../../lib/classify'
import { useRunClustering } from '../../server/mutations'
import { IntegrateRepoDialog } from './IntegrateRepoDialog'

/** Shared ghost-button look (rounded pill, subtle ring) for secondary actions. */
const GHOST =
  'inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 inset-ring inset-ring-white/10 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'

/** Primary (teal-filled) look for the main create action. */
const PRIMARY =
  'inline-flex items-center gap-1.5 rounded-full bg-teal-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Header CTAs for the Projects index, rendered in `DashboardPage`'s `actions`
 * slot. Self-contained so the route stays declarative: it reads the cached
 * projects list (same query key as the grid — no extra fetch) to decide which
 * actions are meaningful, and owns the integrate-repo dialog + clustering
 * dispatch.
 *
 * There is no "blank create" in this domain — projects are formed by clustering
 * repositories into proposals, then accepted in the review flow. The actions
 * mirror the wired capabilities and gate each on real state:
 *  - Group repositories: dispatch clustering, then route to review. Pro-only
 *    (the server 403s for non-pro), so hidden otherwise — matches ProjectReviewStep.
 *  - Review: jump to the proposal review flow (only when proposals exist).
 *  - Add a repository: fold an unattached repo into a curated project.
 *  - Connect repositories: always available — the source of everything else.
 */
export function ProjectsHeaderActions() {
  const navigate = useNavigate()
  const [integrateOpen, setIntegrateOpen] = useState(false)

  const { data } = useQuery(
    projectsQueries.list({ limit: 100, offset: 0, includeArchived: false }),
  )
  const { data: me } = useQuery({ queryKey: adminKeys.me.detail(), queryFn: getMeFn })
  const clustering = useRunClustering()

  const items = data?.items ?? []
  const { curated, proposals, defaults } = useMemo(() => partitionProjects(items), [items])

  const isPro = me?.plan?.effectivePlan === 'pro'
  const canAddRepo = defaults.length > 0 && curated.length > 0
  const canGroup = isPro && items.length > 0

  const group = () => {
    clustering.mutate(undefined, {
      onSuccess: () => void navigate({ to: '/projects/review' }),
    })
  }

  return (
    <>
      <a href="/settings/github" className={GHOST}>
        <Github className="size-3.5" />
        Connect repositories
      </a>

      {canAddRepo && (
        <button type="button" onClick={() => setIntegrateOpen(true)} className={GHOST}>
          <FolderPlus className="size-3.5" />
          Add a repository
        </button>
      )}

      {proposals.length > 0 && (
        <Link to="/projects/review" className={GHOST}>
          <ClipboardCheck className="size-3.5" />
          Review {proposals.length} proposal{proposals.length === 1 ? '' : 's'}
        </Link>
      )}

      {canGroup && (
        <button type="button" onClick={group} disabled={clustering.isPending} className={PRIMARY}>
          <Wand2 className="size-3.5" />
          {clustering.isPending ? 'Grouping…' : 'Group repositories'}
        </button>
      )}

      <IntegrateRepoDialog
        open={integrateOpen}
        onClose={() => setIntegrateOpen(false)}
        targets={curated}
        repoDefaults={defaults}
      />
    </>
  )
}
