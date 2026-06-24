import { useEffect, useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Button } from '@/components/ui/Button'

export type ProjectIntentChoice =
  | { intent: 'build' }
  | { intent: 'link'; targetProjectId: string }
  | { intent: 'none' }

export function ProjectIntentModal({
  open,
  projects,
  onChoose,
  onClose,
}: {
  readonly open: boolean
  readonly projects: ReadonlyArray<{ id: string; name: string }>
  readonly onChoose: (choice: ProjectIntentChoice) => void
  readonly onClose: () => void
}) {
  const [mode, setMode] = useState<'pick' | 'link'>('pick')
  const [target, setTarget] = useState('')

  // Reset to the choice screen whenever the modal closes, so a half-navigated
  // link flow does not carry over to the next repo the user adds.
  useEffect(() => {
    if (!open) {
      setMode('pick')
      setTarget('')
    }
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div aria-hidden="true" className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
          <DialogTitle className="text-base font-semibold text-zinc-100">
            What should this repo become?
          </DialogTitle>
          <p className="mt-1 text-xs text-zinc-500">
            After it syncs, we can build or extend a Project case study from it.
          </p>

          {mode === 'pick' ? (
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => onChoose({ intent: 'build' })}
                className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-left transition-colors hover:bg-indigo-500/20"
              >
                <p className="text-sm font-medium text-zinc-100">Build a new Project</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Generate a case study from this repo once it syncs.
                </p>
              </button>
              <button
                type="button"
                onClick={() => { setMode('link') }}
                disabled={projects.length === 0}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                <p className="text-sm font-medium text-zinc-100">Link to an existing Project</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {projects.length === 0 ? 'No confirmed projects yet.' : 'Add this repo to a project + regenerate.'}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onChoose({ intent: 'none' })}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
              >
                <p className="text-sm font-medium text-zinc-100">Add to knowledge base only</p>
                <p className="mt-0.5 text-xs text-zinc-400">Sync the repo without creating a Project.</p>
              </button>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              <label htmlFor="link-project" className="text-xs text-zinc-400">
                Existing project
              </label>
              <select
                id="link-project"
                aria-label="existing project"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-zinc-200"
              >
                <option value="">Select a project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  onClick={() => setMode('pick')}
                  className="px-3 py-1.5 text-xs"
                >
                  Back
                </Button>
                <Button
                  onClick={() => target && onChoose({ intent: 'link', targetProjectId: target })}
                  disabled={!target}
                  className="px-3 py-1.5 text-xs"
                >
                  Link
                </Button>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={onClose} className="px-3 py-1.5 text-xs">
              Cancel
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
