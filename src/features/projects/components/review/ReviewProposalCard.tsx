import { Check, GitBranch, X } from 'lucide-react'
import {
  PROJECT_TYPE_LABELS,
  type ProjectSummary,
} from '../../lib/types'
import { usePatchProject } from '../../server/mutations'
import { InlineText } from '../detail/InlineText'

export interface ReviewProposalCardProps {
  readonly proposal:  ProjectSummary
  readonly accepting: boolean
  readonly rejecting: boolean
  readonly onAccept:  () => void
  readonly onReject:  () => void
}

export function ReviewProposalCard({
  proposal,
  accepting,
  rejecting,
  onAccept,
  onReject,
}: ReviewProposalCardProps) {
  const patch = usePatchProject(proposal.id)
  const busy = accepting || rejecting

  return (
    <li className="rounded-md bg-white/2 p-4 inset-ring inset-ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineText
            value={proposal.name}
            displayAs="body"
            className="text-sm font-semibold text-zinc-100"
            ariaLabel="proposal name"
            maxLength={200}
            disabled={busy}
            onSave={(next) => patch.mutate({ name: next ?? proposal.name })}
          />
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-500">
            <span>{PROJECT_TYPE_LABELS[proposal.type] ?? proposal.type}</span>
            <span className="flex items-center gap-1">
              <GitBranch className="size-3" />
              {proposal.repository_count} repo{proposal.repository_count === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 inset-ring inset-ring-white/10 transition-colors hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50"
          >
            <X className="size-3.5" />
            {rejecting ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-teal-500/90 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
          >
            <Check className="size-3.5" />
            {accepting ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
      {patch.isError && (
        <p className="mt-2 text-xs text-rose-300">
          {patch.error instanceof Error ? patch.error.message : 'Rename failed — change reverted'}
        </p>
      )}
    </li>
  )
}
