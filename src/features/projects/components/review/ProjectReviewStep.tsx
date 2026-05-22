import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Sparkles, Wand2 } from 'lucide-react'
import { projectsQueries } from '../../server/queries'
import {
  useArchiveProject,
  useConfirmProject,
  useRunClustering,
} from '../../server/mutations'
import { ReviewProposalCard } from './ReviewProposalCard'

export interface ProjectReviewStepProps {
  /** Called when there are no more proposals to review (all accepted/rejected). */
  readonly onComplete?: () => void
}

export function ProjectReviewStep({ onComplete }: ProjectReviewStepProps) {
  const { data, isPending, isError, error } = useQuery(projectsQueries.proposals())
  const confirm   = useConfirmProject()
  const archive   = useArchiveProject()
  const clustering = useRunClustering()

  const [pendingId, setPendingId] = useState<string | null>(null)

  if (isPending) return <ReviewSkeleton />
  if (isError) {
    return (
      <div className="rounded-2xl bg-rose-400/5 px-6 py-10 text-center inset-ring inset-ring-rose-400/30">
        <p className="text-sm font-medium text-rose-300">Couldn't load proposals</p>
        <p className="mt-1 text-xs text-rose-300/80">{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    )
  }

  const proposals = data?.items ?? []

  if (proposals.length === 0) {
    return <AllReviewed onComplete={onComplete} clustering={clustering} />
  }

  const accept = (id: string) => {
    setPendingId(id)
    confirm.mutate(id, {
      onSettled: () => setPendingId((cur) => (cur === id ? null : cur)),
    })
  }
  const reject = (id: string) => {
    setPendingId(id)
    archive.mutate(id, {
      onSettled: () => setPendingId((cur) => (cur === id ? null : cur)),
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl bg-white/2 px-5 py-4 inset-ring inset-ring-white/10">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-300 inset-ring inset-ring-indigo-400/30">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Review your projects</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Tucaken grouped your repositories into {proposals.length} project
            {proposals.length === 1 ? '' : 's'}. Accept the ones that look right (we'll generate a
            case study), rename any that need it, or reject groupings you don't want.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {proposals.map((p) => (
          <ReviewProposalCard
            key={p.id}
            proposal={p}
            accepting={pendingId === p.id && confirm.isPending}
            rejecting={pendingId === p.id && archive.isPending}
            onAccept={() => accept(p.id)}
            onReject={() => reject(p.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function AllReviewed({
  onComplete,
  clustering,
}: {
  readonly onComplete?: () => void
  readonly clustering:  ReturnType<typeof useRunClustering>
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/2 px-6 py-16 text-center inset-ring inset-ring-white/10">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 inset-ring inset-ring-emerald-400/30">
        <CheckCircle2 className="size-6" />
      </span>
      <div className="max-w-sm space-y-1">
        <h2 className="text-base font-semibold text-zinc-100">No proposals to review</h2>
        <p className="text-sm text-zinc-500">
          Everything's been reviewed. You can re-run detection if you've connected new repositories.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => clustering.mutate()}
          disabled={clustering.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 inset-ring inset-ring-white/10 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <Wand2 className="size-3.5" />
          {clustering.isPending ? 'Starting…' : 'Re-run detection'}
        </button>
        {onComplete && (
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-400"
          >
            Done
          </button>
        )}
      </div>
      {clustering.isError && (
        <p className="text-xs text-rose-300">
          {clustering.error instanceof Error ? clustering.error.message : 'Failed to start detection'}
        </p>
      )}
      {clustering.isSuccess && (
        <p className="text-xs text-zinc-500">Detection started — proposals will appear shortly.</p>
      )}
    </div>
  )
}

function ReviewSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading proposals">
      <div className="h-16 animate-pulse rounded-2xl bg-white/2 inset-ring inset-ring-white/10" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/2 inset-ring inset-ring-white/10" />
      ))}
    </div>
  )
}
