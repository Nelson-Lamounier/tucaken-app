import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import { Check, ChevronsUpDown, FolderGit, FolderGit2, GitBranch, X } from 'lucide-react'
import type { ProjectSummary } from '../../lib/types'
import { useIntegrateRepo } from '../../server/mutations'

export interface IntegrateRepoDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Curated projects a repo can be folded into (merge targets). */
  readonly targets: readonly ProjectSummary[]
  /** Unattached per-repo default projects (merge sources). */
  readonly repoDefaults: readonly ProjectSummary[]
}

/**
 * Fold a synced repository into an existing project. The repo's 1:1 default
 * project is the merge source; the chosen curated project is the target. On
 * success the default is archived and its component reassigned to the target.
 */
export function IntegrateRepoDialog({ open, onClose, targets, repoDefaults }: IntegrateRepoDialogProps) {
  const integrate = useIntegrateRepo()
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? '')
  const [repoId, setRepoId] = useState<string>('')

  // Re-seed the target when the dialog (re)opens or the target set changes, so a
  // stale id from a previous open can't linger after the list shifts.
  useEffect(() => {
    if (open) {
      setTargetId((cur) => (targets.some((t) => t.id === cur) ? cur : targets[0]?.id ?? ''))
      setRepoId('')
      integrate.reset()
    }
    // Re-seed only on the open transition; depending on the mutation object
    // would reset it mid-submit when isPending flips.
  }, [open])

  const selectedTarget = targets.find((t) => t.id === targetId)
  const canSubmit = Boolean(targetId) && Boolean(repoId) && !integrate.isPending

  const submit = () => {
    if (!canSubmit) return
    integrate.mutate(
      { targetId, sourceIds: [repoId] },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md space-y-5 rounded-lg bg-zinc-900 p-6 inset-ring inset-ring-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-100">
                Add a repository to a project
              </DialogTitle>
              <p className="mt-1 text-xs text-zinc-400">
                Fold a synced repository into an existing project — useful when one system spans
                several repos.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Target project picker */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-300">Project</span>
            <Listbox value={targetId} onChange={setTargetId}>
              <div className="relative">
                <ListboxButton className="flex w-full items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-2 text-left text-sm text-zinc-100 inset-ring inset-ring-white/10 hover:bg-white/10">
                  <span className="flex min-w-0 items-center gap-2">
                    <FolderGit2 className="size-4 shrink-0 text-teal-300" />
                    <span className="truncate">{selectedTarget?.name ?? 'Select a project'}</span>
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 text-zinc-500" />
                </ListboxButton>
                <ListboxOptions className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-zinc-800 py-1 inset-ring inset-ring-white/10">
                  {targets.map((t) => (
                    <ListboxOption
                      key={t.id}
                      value={t.id}
                      className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-200 data-focus:bg-white/5"
                    >
                      <span className="truncate">{t.name}</span>
                      {t.id === targetId && <Check className="size-4 shrink-0 text-teal-300" />}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>

          {/* Repository picker */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-300">Repository</span>
            {repoDefaults.length === 0 ? (
              <p className="rounded-md bg-white/2 px-3 py-3 text-xs text-zinc-500 inset-ring inset-ring-white/10">
                No unattached repositories. Every synced repo is already part of a project.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-auto">
                {repoDefaults.map((r) => {
                  const selected = r.id === repoId
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setRepoId(r.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors inset-ring ${
                          selected
                            ? 'bg-teal-400/10 text-teal-200 inset-ring-teal-400/30'
                            : 'bg-white/2 text-zinc-200 inset-ring-white/10 hover:bg-white/5'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FolderGit className="size-4 shrink-0 text-zinc-400" />
                          <span className="truncate">{r.name}</span>
                        </span>
                        {selected ? (
                          <Check className="size-4 shrink-0 text-teal-300" />
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                            <GitBranch className="size-3" />
                            {r.repository_count}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {integrate.isError && (
            <p className="text-xs text-rose-300">
              {integrate.error instanceof Error ? integrate.error.message : 'Failed to integrate repository'}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
            >
              {integrate.isPending ? 'Adding…' : 'Add to project'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
